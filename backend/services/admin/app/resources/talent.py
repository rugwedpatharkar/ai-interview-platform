"""Talent pool (recruiter-facing, read-only).

The pool is the set of candidates who have applied to the company's jobs, with their
application count. Manager-only, comp-scoped. (Explicit add-to-pool is a follow-up.)
"""

import base64

from lib.errors import ValidationError
from lib.logging import bind_ids, get_logger, log_context
from lib.schemas import Role

from app.errors import ForbiddenError

log = get_logger(component="talent.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}
_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


def _encode_str_cursor(s: str) -> str:
    return base64.urlsafe_b64encode(s.encode("utf-8")).decode("ascii")


def _decode_str_cursor(token: str) -> str | None:
    if not token:
        return None
    try:
        return base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
    except (ValueError, UnicodeDecodeError, UnicodeEncodeError) as exc:
        raise ValidationError("invalid page_token") from exc


async def get_talent_pool(identity, page_size, page_token, *, applications):
    async with log_context(
        log,
        "resource.talent.get_talent_pool",
        **bind_ids(comp_id=identity["comp_id"]),
    ):
        if identity["role"] not in _MANAGER_ROLES:
            raise ForbiddenError("Only company users can view the talent pool")
        size = max(1, min(page_size or _DEFAULT_PAGE_SIZE, _MAX_PAGE_SIZE))
        after_user_id = _decode_str_cursor(page_token)
        entries, next_after = await applications.list_talent_pool_paginated(
            identity["comp_id"], page_size=size, after_user_id=after_user_id
        )
        total = (
            await applications.count_talent_pool(identity["comp_id"])
            if not page_token
            else 0
        )
        return {
            "entries": [
                {"candidate_user_id": uid, "application_count": cnt}
                for uid, cnt in entries
            ],
            "next_page_token": _encode_str_cursor(next_after) if next_after else "",
            "total_count": total,
        }
