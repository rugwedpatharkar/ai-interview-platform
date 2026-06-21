from typing import Any

from pydantic import BaseModel


class Response(BaseModel):
    """Standard API response envelope used across services."""

    status: bool = True
    message: str = "ok"
    data: Any = None
