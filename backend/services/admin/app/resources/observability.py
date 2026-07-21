"""ObservabilityService resource layer — see plan and spec §3.2 for invariants."""

import json
import re

from lib.logging import bind_ids, get_logger, log_context

from app.errors import ValidationError

log = get_logger(component="observability.resources")

_MAX_ERRORS_PER_CALL = 50
_MAX_EVENTS_PER_CALL = 100
_MAX_STACK_BYTES = 8192
_MAX_PROPS_BYTES = 4096

# Redactor for known-sensitive substrings + free-text PII patterns. The keyed form
# (password=abc, token=xyz) mirrors lib/lib/logging.py:_SENSITIVE; the standalone
# patterns catch PII embedded in FE stack traces (e.g. "TypeError at fetch(a@b.co)").
_REDACT_RE = re.compile(
    r"(?i)\b(password|token|secret|api[_-]?key|authorization|bearer)\b[^\s,;]*",
)
# Standalone email — must not accidentally chew a URL path component. Requires the
# @-separator + a TLD-like right side.
_EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")
# US SSN AAA-GG-SSSS (widest match; not perfect but catches the common case).
_SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
# Credit-card-shaped digit run (13-19 digits, allowing dashes/spaces). Not
# Luhn-validated — the goal is redaction not validation.
_CARD_RE = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
# JWT-shaped bearer body: 3 base64url segments joined by dots (a leaked FE token).
_JWT_RE = re.compile(r"\beyJ[\w-]+\.[\w-]+\.[\w-]+\b")


def _redact(s: str) -> str:
    if not s:
        return s
    s = _REDACT_RE.sub(r"\1=***", s)
    s = _JWT_RE.sub("***jwt***", s)
    s = _EMAIL_RE.sub("***email***", s)
    s = _SSN_RE.sub("***ssn***", s)
    s = _CARD_RE.sub("***card***", s)
    return s


def _user_id(identity):
    # `caller_identity` stores it as `id`; `_ANON_IDENTITY` uses `user_id`. Reading
    # only one silently drops the user_id from every authenticated event.
    return identity.get("id") or identity.get("user_id")


def _scrub_identity(identity):
    # auth_kind lets queries distinguish "authed browser reporting for user X" from
    # "anon browser". Was silently conflated at the doc level because the anon path
    # writes user_id=None but shares the storage doc shape.
    uid = _user_id(identity)
    return {
        "user_id": uid,
        "comp_id": identity.get("comp_id") or "",
        "role": identity.get("role"),
        "auth_kind": "authed" if uid else "anon",
    }


async def record_client_error(events, *, errors_repo, dedup, identity):
    async with log_context(
        log,
        "resource.observability.record_client_error",
        **bind_ids(comp_id=identity.get("comp_id"), user_id=_user_id(identity)),
    ):
        if not events:
            return []
        if len(events) > _MAX_ERRORS_PER_CALL:
            raise ValidationError(f"max {_MAX_ERRORS_PER_CALL} events per call")
        scrubbed = _scrub_identity(identity)
        accepted = []
        for e in events:
            doc = {
                "event_id": e.event_id,
                "correlation_id": e.correlation_id,
                "occurred_at_ms": e.occurred_at_ms,
                "component": e.component,
                "route": e.route,
                "build_sha": e.build_sha,
                "user_agent_hash": e.user_agent_hash,
                "error": {
                    "name": e.error.name,
                    "message": _redact(e.error.message),
                    "stack_truncated_8k": _redact(
                        e.error.stack_truncated_8k[:_MAX_STACK_BYTES]
                    ),
                },
                **scrubbed,
            }
            if await errors_repo.insert_dedup(doc, dedup=dedup):
                accepted.append(e.event_id)
        return accepted


async def record_client_event(events, *, events_repo, dedup, identity):
    async with log_context(
        log,
        "resource.observability.record_client_event",
        **bind_ids(comp_id=identity.get("comp_id"), user_id=_user_id(identity)),
    ):
        if not events:
            return []
        if len(events) > _MAX_EVENTS_PER_CALL:
            raise ValidationError(f"max {_MAX_EVENTS_PER_CALL} events per call")
        scrubbed = _scrub_identity(identity)
        accepted = []
        for e in events:
            props_json = (
                e.properties_json[:_MAX_PROPS_BYTES] if e.properties_json else "{}"
            )
            try:
                json.loads(props_json)
            except json.JSONDecodeError:
                continue
            doc = {
                "event_id": e.event_id,
                "correlation_id": e.correlation_id,
                "occurred_at_ms": e.occurred_at_ms,
                "name": e.name,
                "route": e.route,
                "properties_json": props_json,
                **scrubbed,
            }
            if await events_repo.insert_dedup(doc, dedup=dedup):
                accepted.append(e.event_id)
        return accepted
