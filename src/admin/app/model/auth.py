from datetime import UTC, datetime

from lib.schemas import Role
from pydantic import BaseModel, EmailStr, Field


class User(BaseModel):
    email: EmailStr
    password_hash: str
    role: Role
    comp_id: str | None = None
    email_verified: bool = False
    # Account-security additions (all optional/defaulted; SettingsService owns them).
    totp_secret: str = ""  # Fernet-encrypted TOTP secret; "" when 2FA not set up
    totp_enabled: bool = False
    recovery_codes: list = Field(default_factory=list)  # hashed one-time codes
    pending_email: str = ""  # staged email change, awaiting verification
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Company(BaseModel):
    name: str
    verified: bool = False
    plan: str = "free"
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
