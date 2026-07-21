"""Pure iCalendar VEVENT builder (RFC 5545) — no third-party dependency.

Emits a single-event VCALENDAR with a stable UID and SEQUENCE=version so a re-sent
invite updates the event instead of duplicating it. Every instant is UTC (Zulu).
"""

from datetime import datetime, timedelta


def _ics_dt(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ")


def _escape(text: str) -> str:
    # RFC 5545 TEXT escaping: backslash, semicolon, comma, and newlines.
    # Lone `\r` (macOS-classic linefeeds or crafted injections like "Zoom\rDESCRIPTION:")
    # was untouched — some ICS parsers unfold on bare `\r` and re-inject the smuggled
    # line. Replace it before the pairwise CRLF pass so both variants are neutralised.
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def build_ics(
    *,
    booking_id: str,
    version: int,
    start_at: datetime,
    duration_minutes: int,
    title: str,
    now: datetime,
    location: str = "",
    note: str = "",
    organizer_email: str = "",
    attendee_email: str = "",
) -> str:
    end_at = start_at + timedelta(minutes=duration_minutes)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Aptura//Interview//EN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:aptura-interview-{booking_id}@aptura",
        f"SEQUENCE:{version}",
        f"DTSTAMP:{_ics_dt(now)}",
        f"DTSTART:{_ics_dt(start_at)}",
        f"DTEND:{_ics_dt(end_at)}",
        f"SUMMARY:{_escape(title)}",
    ]
    if location:
        lines.append(f"LOCATION:{_escape(location)}")
    if note:
        lines.append(f"DESCRIPTION:{_escape(note)}")
    if organizer_email:
        lines.append(f"ORGANIZER:mailto:{organizer_email}")
    if attendee_email:
        lines.append(f"ATTENDEE:mailto:{attendee_email}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines) + "\r\n"
