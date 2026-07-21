"""TOTP provider + symmetric secret box (2FA), injected behind seams so tests fake them.

`PyotpProvider` wraps pyotp; `FernetSecretBox` encrypts the TOTP secret at rest with a
Fernet key derived from the app secret via HKDF-SHA256 with an info-label distinct
from any other key use — so a leak of either JWT-signing bits or TOTP-AEAD bits does
not undermine the other primitive.
"""

import base64

import pyotp
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

_ISSUER = "Aptura"

# Fixed info label — do NOT change (would invalidate every stored TOTP secret). If
# you ever need to rotate, add a new label and dual-write during migration.
_TOTP_HKDF_INFO = b"aptura/totp-fernet/v1"


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
        # HKDF-SHA256 domain-separates this Fernet key from the JWT-signing use of the
        # same secret; a leak of one side no longer implies control of the other.
        derived = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=_TOTP_HKDF_INFO,
        ).derive(key_material.encode("utf-8"))
        self._f = Fernet(base64.urlsafe_b64encode(derived))

    def encrypt(self, plain: str) -> str:
        return self._f.encrypt(plain.encode("utf-8")).decode("utf-8")

    def decrypt(self, token: str) -> str:
        return self._f.decrypt(token.encode("utf-8")).decode("utf-8")
