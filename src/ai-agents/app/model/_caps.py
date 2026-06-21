"""Graceful caps for LLM-authored model fields.

Clip over-long strings/lists instead of rejecting them, so a hallucinated or adversarial
model response can't bloat a stored document (MongoDB's 16 MB per-doc limit), stall a
downstream read, or balloon an interview (an uncapped competency list). Truncation
degrades gracefully — verbose output is clipped, never dead-lettered. Apply via
``Annotated[str, clip(500)]`` / ``Annotated[list[X], clip(30)]`` on the field.
"""

from pydantic import AfterValidator


def clip(n: int) -> AfterValidator:
    """An AfterValidator that truncates a str or list to at most `n` units."""

    def _apply(v):
        return v[:n] if isinstance(v, (str, list)) else v

    return AfterValidator(_apply)
