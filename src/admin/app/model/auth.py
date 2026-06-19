from datetime import UTC, datetime

from lib.schemas import Role
from pydantic import BaseModel, EmailStr, Field


class User(BaseModel):
    email: EmailStr
    password_hash: str
    role: Role
    comp_id: str | None = None
    email_verified: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Company(BaseModel):
    name: str
    verified: bool = False
    plan: str = "free"
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
