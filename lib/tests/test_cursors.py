import pytest
from bson import ObjectId
from lib.cursors import decode_cursor, encode_cursor
from lib.errors import ValidationError


def test_encode_decode_roundtrip():
    oid = ObjectId()
    token = encode_cursor(oid)
    assert isinstance(token, str)
    assert decode_cursor(token) == oid


def test_decode_none_means_first_page():
    assert decode_cursor(None) is None
    assert decode_cursor("") is None


def test_decode_invalid_token_raises_validation_error():
    with pytest.raises(ValidationError):
        decode_cursor("not-base64!@#")


def test_decode_valid_base64_but_not_objectid_raises():
    import base64

    bogus = base64.urlsafe_b64encode(b"too-short").decode()
    with pytest.raises(ValidationError):
        decode_cursor(bogus)


def test_encode_accepts_string_oid():
    oid_str = str(ObjectId())
    token = encode_cursor(oid_str)
    assert decode_cursor(token) == ObjectId(oid_str)
