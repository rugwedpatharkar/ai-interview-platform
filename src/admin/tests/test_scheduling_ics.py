from datetime import UTC, datetime

from app.resources.scheduling_ics import build_ics


def test_build_ics_stable_uid_sequence_and_utc_times():
    ics = build_ics(
        booking_id="b1",
        version=2,
        start_at=datetime(2026, 6, 24, 14, 0, tzinfo=UTC),
        duration_minutes=45,
        title="Interview: Backend Engineer",
        location="Google Meet",
        note="Bring questions",
        now=datetime(2026, 6, 20, 9, 0, tzinfo=UTC),
    )
    assert "BEGIN:VCALENDAR" in ics and "BEGIN:VEVENT" in ics
    # Stable UID + SEQUENCE=version → a re-sent invite is an update, not a duplicate.
    assert "UID:aptura-interview-b1@aptura" in ics
    assert "SEQUENCE:2" in ics
    assert "DTSTART:20260624T140000Z" in ics
    assert "DTEND:20260624T144500Z" in ics  # start + 45 min, UTC Zulu
    assert ics.endswith("\r\n")  # CRLF line endings per RFC 5545


def test_build_ics_escapes_text_fields():
    ics = build_ics(
        booking_id="b1",
        version=0,
        start_at=datetime(2026, 6, 24, 14, 0, tzinfo=UTC),
        duration_minutes=30,
        title="Interview, round 2; final",
        now=datetime(2026, 6, 20, 9, 0, tzinfo=UTC),
    )
    assert "SUMMARY:Interview\\, round 2\\; final" in ics
