from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class IndexSpec:
    """One index to ensure. `keys` is a pymongo key spec (str or list of pairs)."""

    collection: str
    keys: Any
    options: dict = field(default_factory=dict)


async def ensure_indexes(db: Any, specs: list[IndexSpec]) -> None:
    """Create the given indexes. Idempotent (Mongo no-ops on existing indexes)."""
    for spec in specs:
        await db[spec.collection].create_index(spec.keys, **spec.options)
