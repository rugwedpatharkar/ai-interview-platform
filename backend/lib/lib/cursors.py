"""Opaque pagination cursors for Mongo collections.

Encoded as urlsafe-base64 of the ObjectId's 12-byte binary. Stateless: the server
never stores cursor state, the client just rounds-trips the token. ``decode_cursor``
raises ValidationError on invalid input so the boundary translator returns
``INVALID_ARGUMENT`` rather than letting a malformed token surface as INTERNAL.
"""

import base64

from bson import ObjectId
from bson.errors import InvalidId

from lib.errors import ValidationError


def encode_cursor(doc_id) -> str:
    """Encode a Mongo ObjectId (or its string form) as an opaque base64 token."""
    if isinstance(doc_id, str):
        doc_id = ObjectId(doc_id)
    return base64.urlsafe_b64encode(doc_id.binary).decode("ascii")


def decode_cursor(token):
    """Decode an opaque pagination token back to an ObjectId, or None if empty.

    Returns ``None`` for empty/None token (caller treats as first page).
    Raises ``ValidationError`` for malformed input.
    """
    if not token:
        return None
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise ValidationError("invalid page_token") from exc
    try:
        return ObjectId(raw)
    except (InvalidId, ValueError, TypeError) as exc:
        raise ValidationError("invalid page_token") from exc
