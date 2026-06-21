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
    # Team-seat lifecycle (company members; candidates leave these at defaults).
    status: str = "pending"  # pending | active | revoked
    last_active_at: datetime | None = None
    invited_by: str = ""  # inviter user_id; "" for founding members
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Company(BaseModel):
    name: str
    verified: bool = False
    plan: str = "free"
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
