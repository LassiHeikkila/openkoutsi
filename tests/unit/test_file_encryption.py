"""Unit tests for per-user FIT file encryption."""
from pathlib import Path
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet

# A stable test key — generated once so tests are deterministic.
_TEST_KEY = Fernet.generate_key().decode()


def _patch_key(key=_TEST_KEY):
    from backend.app.core import config
    return patch.object(config.settings, "encryption_key", key)


class TestEncryptDecryptRoundtrip:
    def test_roundtrip_returns_original_bytes(self, tmp_path: Path):
        original = b"FIT\x0e\x10\x00\x00\x00.FIT" + b"\xff" * 100
        f = tmp_path / "test.fit"
        f.write_bytes(original)

        with _patch_key():
            from backend.app.core.file_encryption import decrypt_file, encrypt_file
            encrypt_file(f, "user-abc")
            result = decrypt_file(f, "user-abc")

        assert result == original

    def test_encrypted_file_does_not_match_original(self, tmp_path: Path):
        original = b"plaintext FIT content"
        f = tmp_path / "test.fit"
        f.write_bytes(original)

        with _patch_key():
            from backend.app.core.file_encryption import encrypt_file
            encrypt_file(f, "user-abc")

        assert f.read_bytes() != original

    def test_same_content_different_users_produces_different_ciphertext(self, tmp_path: Path):
        """Each user's derived key is independent — same plaintext encrypts differently."""
        data = b"identical content"
        fa = tmp_path / "a.fit"
        fb = tmp_path / "b.fit"
        fa.write_bytes(data)
        fb.write_bytes(data)

        with _patch_key():
            from backend.app.core.file_encryption import encrypt_file
            encrypt_file(fa, "user-a")
            encrypt_file(fb, "user-b")

        assert fa.read_bytes() != fb.read_bytes()

    def test_wrong_user_cannot_decrypt(self, tmp_path: Path):
        """Decrypting with a different user's key raises InvalidToken."""
        from cryptography.fernet import InvalidToken

        f = tmp_path / "test.fit"
        f.write_bytes(b"sensitive FIT data")

        with _patch_key():
            from backend.app.core.file_encryption import decrypt_file, encrypt_file
            encrypt_file(f, "user-a")
            with pytest.raises(InvalidToken):
                decrypt_file(f, "user-b")

    def test_missing_encryption_key_raises_runtime_error(self, tmp_path: Path):
        f = tmp_path / "test.fit"
        f.write_bytes(b"data")

        with _patch_key(key=None):
            from backend.app.core.file_encryption import encrypt_file
            with pytest.raises(RuntimeError, match="ENCRYPTION_KEY"):
                encrypt_file(f, "user-abc")

    def test_same_user_key_is_deterministic(self, tmp_path: Path):
        """Deriving the key twice for the same user yields the same Fernet instance."""
        from backend.app.core.file_encryption import _derive_user_fernet

        with _patch_key():
            k1 = _derive_user_fernet("user-xyz")
            k2 = _derive_user_fernet("user-xyz")

        # Encrypt with k1, decrypt with k2 — they must agree.
        ciphertext = k1.encrypt(b"hello")
        assert k2.decrypt(ciphertext) == b"hello"
