from datetime import UTC, datetime

from pydantic import BaseModel, Field


class CompanyProfile(BaseModel):
    comp_id: str
    about: str = ""
    website: str = ""
    logo: str = ""  # logo URL ("" when unset)
    locations: list = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
