"""Per-user Appearance preferences (v3 personalization) — theme mode / base / accent.

Server-authoritative + token-scoped; one shape serves candidate and company users. The
custom accent hue is clamped to the 0..359 ring and only kept when accent == "custom".
"""

from typing import Literal

from pydantic import BaseModel, model_validator

Mode = Literal["system", "light", "dark"]
Base = Literal["midnight", "azure", "mint", "slate"]
Accent = Literal["cyan", "lime", "emerald", "amber", "coral", "azure", "custom"]


class AppearancePrefs(BaseModel):
    mode: Mode = "system"
    base: Base = "midnight"
    accent: Accent = "cyan"
    accent_hue: int | None = None

    @model_validator(mode="after")
    def _normalise_hue(self) -> "AppearancePrefs":
        # accent_hue is only meaningful for the custom accent; clamp to the colour ring.
        if self.accent == "custom" and self.accent_hue is not None:
            self.accent_hue = int(self.accent_hue) % 360
        else:
            self.accent_hue = None
        return self

    @classmethod
    def from_dict(cls, payload: dict) -> "AppearancePrefs":
        """Build from an untrusted payload — unknown enum value raises ValueError
        (pydantic ValidationError is a ValueError), and the hue is clamped."""
        return cls(**payload)

    def to_dict(self) -> dict:
        return {
            "mode": self.mode,
            "base": self.base,
            "accent": self.accent,
            "accent_hue": self.accent_hue,
        }


DEFAULTS = AppearancePrefs()
