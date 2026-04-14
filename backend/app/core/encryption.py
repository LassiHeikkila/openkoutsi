"""
Field-level encryption for sensitive database columns.

Uses Fernet symmetric encryption (AES-128-CBC + HMAC-SHA256).
Set ENCRYPTION_KEY in the environment to enable encryption.
If the key is not set, values are stored as plaintext (development mode).

Generate a key:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import String
from sqlalchemy.types import TypeDecorator


def _get_fernet():
    from backend.app.core.config import settings
    if not settings.encryption_key:
        return None
    from cryptography.fernet import Fernet
    return Fernet(settings.encryption_key.encode())


class EncryptedString(TypeDecorator):
    """A String column that is transparently encrypted/decrypted at the ORM layer."""

    impl = String
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> str | None:
        if value is None:
            return None
        fernet = _get_fernet()
        if fernet is None:
            return value
        return fernet.encrypt(value.encode()).decode()

    def process_result_value(self, value: Any, dialect: Any) -> str | None:
        if value is None:
            return None
        fernet = _get_fernet()
        if fernet is None:
            return value
        try:
            return fernet.decrypt(value.encode()).decode()
        except Exception:
            # Return the raw value if decryption fails (e.g. plaintext from before encryption was enabled)
            return value
