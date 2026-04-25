"""
Per-user file encryption for FIT files stored on disk.

Each user gets a unique Fernet key derived deterministically from the master
ENCRYPTION_KEY and their user ID via HKDF-SHA256. This means no per-user key
needs to be stored in the database — the key is always recoverable from the
master key + user ID.

ENCRYPTION_KEY must be set in the environment. Unlike the DB field encryption
(which silently skips when the key is absent), file encryption raises a hard
error if the key is missing so callers know clearly that the file was NOT
encrypted.
"""

from __future__ import annotations

import base64
import logging
from pathlib import Path

log = logging.getLogger(__name__)


def _derive_user_fernet(user_id: str):
    """Return a Fernet instance keyed to this specific user."""
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    from backend.app.core.config import settings

    if not settings.encryption_key:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set — cannot encrypt/decrypt FIT files"
        )

    raw_master = base64.urlsafe_b64decode(settings.encryption_key.encode())
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=f"fit-file-encryption:{user_id}".encode(),
    )
    derived = hkdf.derive(raw_master)
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt_file(path: Path, user_id: str) -> None:
    """Encrypt the file at *path* in-place using the user's derived key."""
    fernet = _derive_user_fernet(user_id)
    data = path.read_bytes()
    path.write_bytes(fernet.encrypt(data))
    log.debug("Encrypted %s for user %s", path, user_id)


def decrypt_file(path: Path, user_id: str) -> bytes:
    """Read and decrypt the file at *path*, returning the plaintext bytes."""
    fernet = _derive_user_fernet(user_id)
    return fernet.decrypt(path.read_bytes())


# ── Small-secret encryption (LLM API keys etc.) ───────────────────────────
#
# Uses the same master ENCRYPTION_KEY but a different HKDF info string so
# that the derived key is completely independent from the FIT-file key.
# This means a compromised FIT-file key cannot be used to decrypt secrets
# and vice-versa.

def _derive_user_fernet_secrets(user_id: str):
    """Return a Fernet instance keyed to this user's secrets (distinct from FIT key)."""
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    from backend.app.core.config import settings

    if not settings.encryption_key:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set — cannot encrypt/decrypt secrets"
        )

    raw_master = base64.urlsafe_b64decode(settings.encryption_key.encode())
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=f"llm-api-key:{user_id}".encode(),
    )
    derived = hkdf.derive(raw_master)
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt_secret(plaintext: str, user_id: str) -> str:
    """Encrypt a short secret string using the user's derived secrets key.

    Returns a URL-safe base-64 Fernet token (str).  The result can be stored
    in the database; only the server can decrypt it.
    """
    fernet = _derive_user_fernet_secrets(user_id)
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_secret(token: str, user_id: str) -> str:
    """Decrypt a Fernet token previously produced by *encrypt_secret*.

    Returns the original plaintext string.
    """
    fernet = _derive_user_fernet_secrets(user_id)
    return fernet.decrypt(token.encode()).decode()
