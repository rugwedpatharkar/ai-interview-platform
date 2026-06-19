"""Concrete RoomAudio backed by LiveKit (livekit.rtc).

This is the only file that imports ``livekit.rtc``.  All other modules in the
voice pipeline consume the ``RoomAudio`` Protocol seam from
``app/resources/voice/engines.py`` and never import this file directly.

Live-room integration is verified manually in Task 9 (E2E).  Unit tests use
``FakeRoomAudio`` from ``tests/conftest.py`` instead.

Frame conventions
-----------------
* Subscribe  -> ``AudioStream(track, sample_rate=16000)`` -> 16 kHz PCM16 mono
  (livekit resamples on the way out -- no manual resampling needed for STT/VAD).
* Publish    -> ``AudioSource(48000, 1)`` + 480-sample int16 frames (10 ms @ 48 kHz).
  ``capture_frame`` is back-pressured to real-time pacing by the SDK.
* Captions   -> ``publish_data(json_bytes, reliable=True, topic="captions")``.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator

import livekit.rtc as rtc
import numpy as np
from lib.logging import get_logger
from lib.resilience import OperationTimeout, with_timeout

from app.infra.voice.vad import UtteranceSegmenter
from app.resources.voice.engines import RoomError

log = get_logger(component="voice.livekit_room")

_PUBLISH_RATE = 48_000
_PUBLISH_CHANNELS = 1
_PUBLISH_FRAME_SAMPLES = 480  # 10 ms @ 48 kHz (matches edge_tts output)
_SUBSCRIBE_RATE = 16_000  # livekit resamples to 16 kHz on subscribe

_UTTERANCE_TIMEOUT_S = 90.0   # max wait for a candidate utterance before a re-prompt
_PLAY_TIMEOUT_S = 120.0       # max wall-clock to publish one TTS utterance
_DISCONNECT_TIMEOUT_S = 10.0  # max wait for room.disconnect() during teardown


class LiveKitRoomAudio:
    """``RoomAudio`` implementation backed by LiveKit RTC.

    Args:
        url:        LiveKit server WebSocket URL (e.g. ``ws://localhost:7880``).
        token:      Worker participant JWT (minted by ``mint_join_token`` with
                    can_publish + can_subscribe grants).
        segmenter:  Injected ``UtteranceSegmenter`` (makes the unit boundary clean
                    and lets callers swap the VAD implementation).
        room:       Optional pre-built ``rtc.Room`` for testing / injection.
                    When ``None`` (default) a fresh ``Room`` is constructed.
    """

    def __init__(
        self,
        *,
        url: str,
        token: str,
        segmenter: UtteranceSegmenter,
        room: rtc.Room | None = None,
        utterance_timeout_s: float = _UTTERANCE_TIMEOUT_S,
        play_timeout_s: float = _PLAY_TIMEOUT_S,
        disconnect_timeout_s: float = _DISCONNECT_TIMEOUT_S,
    ) -> None:
        self._url = url
        self._token = token
        self._segmenter = segmenter
        self._room = room or rtc.Room()
        self._utterance_timeout_s = utterance_timeout_s
        self._play_timeout_s = play_timeout_s
        self._disconnect_timeout_s = disconnect_timeout_s

        # Publish-side objects created on first ``play()`` call
        self._audio_source: rtc.AudioSource | None = None
        self._audio_track: rtc.LocalAudioTrack | None = None

        # Signals participant disconnect (next_utterance returns None)
        self._candidate_left: asyncio.Event = asyncio.Event()
        # Background task that feeds the segmenter from subscribed audio frames
        self._feed_task: asyncio.Task | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """Connect to the LiveKit room and start the audio-feed background task.

        Sets up the participant-disconnect handler and the track-subscribed
        handler before connecting so no events are missed.

        Raises:
            RoomError: On connection failure.
        """
        self._room.on("participant_disconnected", self._on_participant_disconnected)
        self._room.on("track_subscribed", self._on_track_subscribed)

        log.info("LiveKitRoomAudio: connecting url={}", self._url)
        try:
            await self._room.connect(
                self._url,
                self._token,
                rtc.RoomOptions(auto_subscribe=True),
            )
        except Exception as exc:
            log.error("LiveKitRoomAudio: connect failed: {}", exc)
            raise RoomError(f"Failed to connect to LiveKit room: {exc}") from exc

        log.info(
            "LiveKitRoomAudio: connected room={} participants={}",
            self._room.name,
            self._room.num_participants,
        )

    # ------------------------------------------------------------------
    # RoomAudio Protocol
    # ------------------------------------------------------------------

    async def play(self, pcm16_48k: AsyncIterator[bytes]) -> None:
        """Publish a 48 kHz PCM16 frame stream to the room.

        Creates the audio source and track on the first call (lazy init so the
        track is only published when the agent actually speaks).  Each 480-byte
        frame is pushed via ``capture_frame``, which applies real-time pacing
        (back-pressure from the SDK clock).

        Args:
            pcm16_48k: Async iterator yielding 480-sample (960-byte) int16 frames.

        Raises:
            OperationTimeout: When the full publish exceeds ``_play_timeout_s``.
            RoomError: On fatal publish failure.
        """
        await with_timeout(
            self._play_impl(pcm16_48k), self._play_timeout_s, op="livekit.play"
        )

    async def _play_impl(self, pcm16_48k: AsyncIterator[bytes]) -> None:
        """Inner publish loop — track lifecycle is owned by connect/aclose, not here."""
        try:
            await self._ensure_audio_source()
            if self._audio_source is None:
                raise RoomError("Audio source unavailable after init")

            async for frame_bytes in pcm16_48k:
                samples = len(frame_bytes) // 2  # int16 = 2 bytes
                if samples == 0:
                    continue
                try:
                    frame = rtc.AudioFrame.create(
                        _PUBLISH_RATE, _PUBLISH_CHANNELS, samples
                    )
                    np.copyto(
                        np.frombuffer(frame.data, dtype=np.int16),
                        np.frombuffer(frame_bytes, dtype=np.int16),
                    )
                    await self._audio_source.capture_frame(frame)
                except Exception as exc:
                    log.error("LiveKitRoomAudio: capture_frame failed: {}", exc)
                    raise RoomError(f"Audio publish error: {exc}") from exc
        except RoomError:
            raise
        except Exception as exc:
            log.error("LiveKitRoomAudio: play() error: {}", exc)
            raise RoomError(f"Unexpected error in play(): {exc}") from exc

    async def next_utterance(self) -> bytes | None:
        """Return the next complete VAD-segmented utterance (16 kHz PCM16).

        Blocks until an utterance is available, or raises ``OperationTimeout``
        on prolonged silence (after ``_utterance_timeout_s``).  Returns ``None``
        when the candidate participant has disconnected (hangup signal).

        The caller (VoiceTransport) interprets ``None`` as end-of-interview and
        ``OperationTimeout`` as a silence re-prompt opportunity.

        Raises:
            OperationTimeout: When no utterance arrives within the timeout and
                the candidate has not disconnected.
        """
        # Race: either the segmenter emits an utterance, or the candidate leaves
        done, pending = await asyncio.wait(
            [
                asyncio.create_task(self._segmenter.next_utterance(), name="utterance"),
                asyncio.create_task(self._candidate_left.wait(), name="hangup"),
            ],
            return_when=asyncio.FIRST_COMPLETED,
            timeout=self._utterance_timeout_s,
        )

        # Cancel the task that lost the race (no task leaks)
        for task in pending:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task

        if not done:
            # Timeout elapsed: candidate still connected but silent → re-prompt
            raise OperationTimeout("livekit.next_utterance", self._utterance_timeout_s)

        for task in done:
            if task.get_name() == "hangup":
                log.info(
                    "LiveKitRoomAudio: candidate disconnected -- signalling hangup"
                )
                return None
            # utterance task completed
            try:
                return task.result()
            except Exception as exc:
                log.error("LiveKitRoomAudio: utterance task error: {}", exc)
                raise RoomError(f"Utterance segmenter error: {exc}") from exc

        return None  # unreachable

    async def send_caption(self, who: str, text: str) -> None:
        """Publish a JSON caption message to all room participants.

        Args:
            who:  Speaker identifier (e.g. ``"interviewer"`` or ``"candidate"``).
            text: Caption text.

        Raises:
            RoomError: On publish failure.
        """
        payload = json.dumps({"who": who, "text": text}).encode()
        try:
            await self._room.local_participant.publish_data(
                payload, reliable=True, topic="captions"
            )
            log.debug("LiveKitRoomAudio: caption sent who={} len={}", who, len(text))
        except Exception as exc:
            log.error("LiveKitRoomAudio: send_caption failed who={}: {}", who, exc)
            raise RoomError(f"Caption publish error: {exc}") from exc

    async def aclose(self) -> None:
        """Disconnect from the room and release all media resources.

        Always executes cleanup in a ``finally`` block -- safe to call even if
        ``connect()`` was never completed.
        """
        log.info("LiveKitRoomAudio: closing")
        try:
            if self._feed_task is not None and not self._feed_task.done():
                self._feed_task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await self._feed_task

            if self._audio_track is not None:
                try:
                    await self._room.local_participant.unpublish_track(
                        self._audio_track.sid
                    )
                except Exception as exc:
                    log.warning(
                        "LiveKitRoomAudio: unpublish_track error (ignored): {}", exc
                    )

        finally:
            try:
                await with_timeout(
                    self._room.disconnect(),
                    self._disconnect_timeout_s,
                    op="livekit.disconnect",
                )
                log.info("LiveKitRoomAudio: disconnected cleanly")
            except Exception as exc:
                log.warning("LiveKitRoomAudio: disconnect error (ignored): {}", exc)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _ensure_audio_source(self) -> None:
        """Lazily create the AudioSource + LocalAudioTrack and publish it."""
        if self._audio_source is not None:
            return

        try:
            self._audio_source = rtc.AudioSource(_PUBLISH_RATE, _PUBLISH_CHANNELS)
            self._audio_track = rtc.LocalAudioTrack.create_audio_track(
                "agent-tts", self._audio_source
            )
            opts = rtc.TrackPublishOptions()
            opts.source = rtc.TrackSource.Value("SOURCE_MICROPHONE")
            await self._room.local_participant.publish_track(self._audio_track, opts)
            log.info("LiveKitRoomAudio: audio track published")
        except Exception as exc:
            self._audio_source = None
            self._audio_track = None
            log.error("LiveKitRoomAudio: failed to publish audio track: {}", exc)
            raise RoomError(f"Audio track publish failed: {exc}") from exc

    def _on_track_subscribed(
        self,
        track: rtc.Track,
        publication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        """Callback: a remote participant published an audio track we subscribed to."""
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return

        log.info(
            "LiveKitRoomAudio: audio track subscribed participant={}",
            participant.identity,
        )
        if self._feed_task is not None and not self._feed_task.done():
            log.warning(
                "LiveKitRoomAudio: feed task already running -- skipping duplicate"
                " track subscription from participant={}",
                participant.identity,
            )
            return

        stream = rtc.AudioStream(
            track,
            sample_rate=_SUBSCRIBE_RATE,
            num_channels=1,
        )
        self._feed_task = asyncio.ensure_future(
            self._feed_loop(stream, participant.identity)
        )

    def _on_participant_disconnected(self, participant: rtc.RemoteParticipant) -> None:
        """Callback: a remote participant left the room."""
        log.info(
            "LiveKitRoomAudio: participant disconnected identity={}",
            participant.identity,
        )
        self._candidate_left.set()

    async def _feed_loop(self, stream: rtc.AudioStream, identity: str) -> None:
        """Background task: drain AudioStream frames -> UtteranceSegmenter.

        Runs until the stream ends or is cancelled.  All exceptions are caught
        and logged; the loop exits cleanly so ``next_utterance()`` will unblock
        via the hangup event rather than hanging forever.
        """
        log.info("LiveKitRoomAudio: feed loop started identity={}", identity)
        try:
            async for ev in stream:
                frame: rtc.AudioFrame = ev.frame
                # ev.frame.data is a memoryview of int16 samples already at 16 kHz
                try:
                    self._segmenter.feed(bytes(frame.data))
                except Exception as exc:
                    log.error("LiveKitRoomAudio: segmenter.feed error: {}", exc)
        except asyncio.CancelledError:
            log.debug("LiveKitRoomAudio: feed loop cancelled identity={}", identity)
        except Exception as exc:
            log.error(
                "LiveKitRoomAudio: feed loop error identity={}: {}", identity, exc
            )
        finally:
            log.info("LiveKitRoomAudio: feed loop exited identity={}", identity)
            # feed loop exit ⇒ no more audio ⇒ unblock next_utterance().
            self._candidate_left.set()
