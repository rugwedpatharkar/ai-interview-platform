import base64
import hashlib

import bcrypt


def _prehash(plain: str) -> bytes:
    """SHA-256 + base64 so bcrypt's 72-byte limit never truncates a password."""
    return base64.b64encode(hashlib.sha256(plain.encode("utf-8")).digest())


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_prehash(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_prehash(plain), hashed.encode("utf-8"))
