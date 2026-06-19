"""Typed proctoring event catalog — the contract between the browser ProctorRuntime and
the ingest endpoint.

The client sends `{type, at, meta?}` only; **severity is assigned here**, never trusted
from the client (the input model has no severity field, so it cannot be spoofed). Every
signal is behavioral/technical — we deliberately never infer affect/emotion/attention
state (that is the EU-prohibited zone and a bias risk), only observable events.
"""

from typing import Literal

from pydantic import BaseModel

ProctoringEventType = Literal[
    # B — visual (browser-edge; no raw frames ever leave the device)
    "gaze_off_screen",
    "head_turned_away",
    "lips_move_no_audio",
    "audio_no_lip_move",
    "body_out_of_frame",
    "second_face",
    "phone_detected",
    "camera_occluded",
    "virtual_camera",
    # C — audio (counts/detection only; no voiceprint identity)
    "second_voice",
    "keyboard_typing",
    "synthetic_audio_suspected",
    # D — device / behavior
    "tab_hidden",
    "window_blur",
    "fullscreen_exit",
    "copy",
    "paste_large",
    "devtools_open",
    "multi_monitor",
    "screen_share",
    "keystroke_anomaly",
    "ip_geo_anomaly",
]

Severity = Literal["low", "medium", "high"]

# Canonical severity per type (server-authoritative). Anything not listed is "low".
_SEVERITY: dict[str, Severity] = {
    "second_face": "high",
    "second_voice": "high",
    "phone_detected": "high",
    "screen_share": "high",
    "virtual_camera": "high",
    "synthetic_audio_suspected": "high",
    "lips_move_no_audio": "medium",
    "audio_no_lip_move": "medium",
    "camera_occluded": "medium",
    "body_out_of_frame": "medium",
    "multi_monitor": "medium",
    "paste_large": "medium",
    "devtools_open": "medium",
    "ip_geo_anomaly": "medium",
}
_WEIGHT: dict[Severity, int] = {"low": 1, "medium": 3, "high": 8}


class ProctoringEvent(BaseModel):
    type: ProctoringEventType
    at: str  # client-supplied ISO timestamp (advisory; server stamps received_at)
    meta: dict | None = None


def severity_of(event_type: str) -> Severity:
    return _SEVERITY.get(event_type, "low")


def integrity_score(events: list[ProctoringEvent]) -> int:
    """Weighted sum of severities — higher = more concerning. Advisory only."""
    return sum(_WEIGHT[severity_of(e.type)] for e in events)
