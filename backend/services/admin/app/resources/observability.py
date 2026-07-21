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

# Small inline redactor for known-sensitive substrings — same allowlist as
# lib/lib/logging.py:_SENSITIVE. We replace the value AFTER the key, not the key.
_REDACT_RE = re.compile(
    r"(?i)\b(password|token|secret|api[_-]?key|authorization|bearer)\b[^\s,;]*",
)


def _redact(s: str) -> str:
    if not s:
        return s
    return _REDACT_RE.sub(r"\1=***", s)


def _user_id(identity):
    # `caller_identity` stores it as `id`; `_ANON_IDENTITY` (unauth path) uses `user_id`.
    # Reading only one silently drops the user_id from every authenticated event.
    return identity.get("id") or identity.get("user_id")


def _scrub_identity(identity):
    return {
        "user_id": _user_id(identity),
        "comp_id": identity.get("comp_id") or "",
        "role": identity.get("role"),
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
