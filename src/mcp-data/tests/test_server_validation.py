"""Tests for MCP boundary input validation in app/server.py.

These target the _proctoring_event_list_adapter TypeAdapter that guards the
save_proctoring_events tool before any DB write occurs.
"""

import pytest
from pydantic import ValidationError

from app.server import _proctoring_event_list_adapter


def test_valid_proctoring_event_parses():
    events = [{"type": "second_face", "at": "2026-06-20T10:00:00Z"}]
    validated = _proctoring_event_list_adapter.validate_python(events)
    assert len(validated) == 1
    assert validated[0].type == "second_face"


def test_valid_proctoring_event_with_meta():
    events = [{"type": "tab_hidden", "at": "t", "meta": {"count": 3}}]
    validated = _proctoring_event_list_adapter.validate_python(events)
    assert validated[0].meta == {"count": 3}


def test_empty_events_list_parses():
    assert _proctoring_event_list_adapter.validate_python([]) == []


def test_invalid_event_type_raises():
    with pytest.raises(ValidationError):
        _proctoring_event_list_adapter.validate_python(
            [{"type": "unknown_garbage", "at": "t"}]
        )


def test_missing_at_field_raises():
    with pytest.raises(ValidationError):
        _proctoring_event_list_adapter.validate_python([{"type": "tab_hidden"}])


def test_all_valid_event_types_accepted():
    valid_types = [
        "gaze_off_screen",
        "head_turned_away",
        "lips_move_no_audio",
        "audio_no_lip_move",
        "body_out_of_frame",
        "second_face",
        "phone_detected",
        "camera_occluded",
        "virtual_camera",
        "second_voice",
        "keyboard_typing",
        "synthetic_audio_suspected",
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
    events = [{"type": t, "at": "2026-06-20T00:00:00Z"} for t in valid_types]
    validated = _proctoring_event_list_adapter.validate_python(events)
    assert len(validated) == len(valid_types)
