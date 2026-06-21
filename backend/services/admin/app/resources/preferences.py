"""Per-user Appearance preferences (v3) — transport-agnostic resource functions.

Self-scoped to the caller's token (`identity["id"]`); the request never targets another
user, so one path serves candidate + company alike. Get returns the stored prefs or the
defaults; Update validates via the model and upserts.
"""

from lib.logging import bind_ids, get_logger, log_context

from app.errors import ValidationError
from app.model.appearance_prefs import DEFAULTS, AppearancePrefs

log = get_logger(component="preferences.resources")


async def get_appearance(identity, *, prefs) -> dict:
    async with log_context(
        log, "resource.preferences.get_appearance", **bind_ids(user_id=identity["id"])
    ):
        doc = await prefs.get_by_user(identity["id"])
        return AppearancePrefs.from_dict(doc).to_dict() if doc else DEFAULTS.to_dict()


async def update_appearance(identity, payload, *, prefs) -> dict:
    async with log_context(
        log,
        "resource.preferences.update_appearance",
        **bind_ids(user_id=identity["id"]),
    ):
        try:
            model = AppearancePrefs.from_dict(payload)
        except ValueError as exc:
            raise ValidationError("Invalid appearance preferences") from exc
        await prefs.upsert(identity["id"], model.to_dict())
        log.info("appearance updated: user={}", identity["id"])
        return model.to_dict()
