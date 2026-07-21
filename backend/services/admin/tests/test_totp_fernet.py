"""FernetSecretBox regression tests: HKDF domain-separates the TOTP key from
any other HMAC use of the same input material (see H8 hardening)."""

import hashlib

from app.infra.totp import FernetSecretBox


def test_secretbox_roundtrip():
    box = FernetSecretBox("x" * 40)
    assert box.decrypt(box.encrypt("otp-secret")) == "otp-secret"


def test_secretbox_key_is_not_sha256_of_input():
    """If someone reverts to `sha256(key_material)` as the Fernet key, TOTP would
    share bits with any other HMAC-SHA256 use of jwt_secret. Assert the derived
    key differs from a naive SHA256 so the regression is caught.
    """
    key_material = "x" * 40
    # Encrypt with the current (HKDF-derived) box, then attempt to decrypt with a
    # box built from the naive SHA256 of the same input. The naive key differs so
    # decryption must fail.
    import base64

    from cryptography.fernet import Fernet, InvalidToken

    good = FernetSecretBox(key_material)
    token = good.encrypt("otp-secret")

    naive_key = base64.urlsafe_b64encode(hashlib.sha256(key_material.encode()).digest())
    naive_fernet = Fernet(naive_key)
    try:
        naive_fernet.decrypt(token.encode())
    except InvalidToken:
        return  # expected — HKDF-derived key ≠ SHA256(material)
    raise AssertionError("HKDF regressed: naive SHA256 key can decrypt the token")


def test_secretbox_different_key_material_produces_incompatible_ciphertexts():
    a = FernetSecretBox("a" * 40)
    b = FernetSecretBox("b" * 40)
    token = a.encrypt("otp-secret")
    from cryptography.fernet import InvalidToken

    try:
        b.decrypt(token)
    except InvalidToken:
        return
    raise AssertionError("different key material must not decrypt")
