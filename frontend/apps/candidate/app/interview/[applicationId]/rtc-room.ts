// Live interview room seam — the page consumes this tiny interface; the transport (real RTC
// vs. offline fake) swaps behind it. No mute / camera-off control is exposed anywhere: the
// published tracks stay enabled for the whole session (the load-bearing no-mute invariant).

import type { RtcToken } from "./types";

export interface InterviewRoom {
  // The local camera+mic stream, shown in the self-view tile (kept enabled all session).
  localVideo: MediaStream;
  // Live captions from the interviewer/agent (final + interim).
  onCaption: (cb: (text: string, final: boolean) => void) => void;
  // Interviewer speaking indicator (for a VU dot); best-effort.
  onRemoteSpeaking: (cb: (active: boolean) => void) => void;
  disconnect: () => Promise<void>;
}

// REAL transport — STUB this round (adding livekit-client touches the shared lockfile + needs
// a browser, both out of scope). It currently behaves like the fake so the page is wired
// end-to-end; production swaps the body for the real connection.
//
// DEFERRED FOLLOW-UP (needs livekit-client + a browser): connect to LiveKit and publish the
// already-acquired camera+mic tracks, then subscribe to the agent's audio + caption data
// channel:
//   const { Room } = await import("livekit-client");        // lazy: SSR-safe
//   const room = new Room({ adaptiveStream: true });
//   await room.connect(tok.url, tok.token);
//   for (const t of media.getTracks()) await room.localParticipant.publishTrack(t);
//   // …wire onCaption from the data track, onRemoteSpeaking from active-speaker events…
//   return { localVideo: media, onCaption, onRemoteSpeaking, disconnect: () => room.disconnect() };
// No mute/unpublish control is added — tracks stay enabled until disconnect().
export async function connectRoom(_tok: RtcToken, media: MediaStream): Promise<InterviewRoom> {
  return makeFakeRoom(media);
}

// FAKE transport — no LiveKit, no network: a self-view (the provided stream) + scripted
// captions so the room renders and the proctoring loop runs fully offline. Used when the room
// is exercised without an RTC server (the page picks this whenever a real connection isn't
// configured, e.g. NEXT_PUBLIC_MOCK=1).
export function makeFakeRoom(media: MediaStream): InterviewRoom {
  let capCb: (t: string, f: boolean) => void = () => {};
  let speakCb: (active: boolean) => void = () => {};
  const captions = [
    "Tell me about a system you designed and the trade-offs you made.",
    "How did you handle the failure modes in that design?",
    "Walk me through how you'd scale it ten times.",
  ];
  let i = 0;
  const capTimer = setInterval(() => {
    if (i < captions.length) {
      const line = captions[i++];
      if (line !== undefined) capCb(line, true);
    }
  }, 4000);
  const speakTimer = setInterval(() => speakCb(Math.random() > 0.5), 1500);
  return {
    localVideo: media,
    onCaption: (cb) => {
      capCb = cb;
    },
    onRemoteSpeaking: (cb) => {
      speakCb = cb;
    },
    disconnect: async () => {
      clearInterval(capTimer);
      clearInterval(speakTimer);
    },
  };
}

// Small canvas → captureStream() helper so the device pre-check + self-view work without a
// real camera (gated by the caller on NEXT_PUBLIC_MOCK). A faint moving marker keeps the
// stream visibly "live". Returns a MediaStream with one video track (+ a silent audio track
// so getAudioTracks() is non-empty for the detectors).
export function fakeStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  let t = 0;
  const draw = () => {
    if (!ctx) return;
    ctx.fillStyle = "#0b0b12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#7c5cff";
    const x = canvas.width / 2 + Math.sin(t / 20) * 80;
    ctx.beginPath();
    ctx.arc(x, canvas.height / 2, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#cfcfe6";
    ctx.font = "16px sans-serif";
    ctx.fillText("Self-view (preview)", 16, 28);
    t += 1;
  };
  const interval = setInterval(draw, 50);
  draw();
  const stream = (canvas as HTMLCanvasElement & {
    captureStream(fps?: number): MediaStream;
  }).captureStream(20);
  // Stop the draw loop when the (single) video track ends so the canvas timer is released.
  const track = stream.getVideoTracks()[0];
  if (track) track.addEventListener("ended", () => clearInterval(interval));
  // Add a silent audio track so the audio detector seam has a track to attach to offline.
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      const audioCtx = new Ctor();
      const dest = audioCtx.createMediaStreamDestination();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0; // silent
      osc.connect(gain).connect(dest);
      osc.start();
      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) stream.addTrack(audioTrack);
    }
  } catch {
    // Audio context unavailable (e.g. SSR/jsdom) — the silent track is best-effort.
  }
  return stream;
}
