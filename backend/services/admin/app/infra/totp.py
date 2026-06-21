"""TOTP provider + symmetric secret box (2FA), injected behind seams so tests fake them.

`PyotpProvider` wraps pyotp; `FernetSecretBox` encrypts the TOTP secret at rest with a
Fernet key derived from the app secret (so a DB leak alone never exposes live secrets).
"""

import base64
import hashlib

import pyotp
from cryptography.fernet import Fernet

_ISSUER = "Aptura"


class PyotpProvider:
    def new_secret(self) -> str:
        return pyotp.random_base32()

    def provisioning_uri(self, secret: str, *, account: str) -> str:
        return pyotp.TOTP(secret).provisioning_uri(name=account, issuer_name=_ISSUER)

    def verify(self, secret: str, code: str) -> bool:
        # valid_window=1 tolerates ~30s clock skew either side.
        return pyotp.TOTP(secret).verify((code or "").strip(), valid_window=1)


class FernetSecretBox:
    def __init__(self, key_material: str) -> None:
        digest = hashlib.sha256(key_material.encode("utf-8")).digest()
        self._f = Fernet(base64.urlsafe_b64encode(digest))

    def encrypt(self, plain: str) -> str:
        return self._f.encrypt(plain.encode("utf-8")).decode("utf-8")

    def decrypt(self, token: str) -> str:
        return self._f.decrypt(token.encode("utf-8")).decode("utf-8")
