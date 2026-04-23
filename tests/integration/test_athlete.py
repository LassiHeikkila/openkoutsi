"""
Integration tests for /api/athlete endpoints.
"""
import io
import json
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

TESTDATA = Path(__file__).parent.parent.parent / "testdata"
SAMPLE_FIT = TESTDATA / "Zwift_Aerobic_Foundation_Forge.fit"


class TestGetAthlete:
    async def test_returns_profile_after_registration(self, client, auth_headers):
        resp = await client.get("/api/athlete/", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["hr_zones"] == []
        assert data["power_zones"] == []
        assert data["ftp_tests"] == []
        assert data["connected_providers"] == []

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.get("/api/athlete/")
        assert resp.status_code == 401


class TestUpdateAthlete:
    async def test_set_ftp_records_test_history(self, client, auth_headers):
        resp = await client.put("/api/athlete/", json={"ftp": 280}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["ftp"] == 280
        assert len(data["ftp_tests"]) == 1
        assert data["ftp_tests"][0]["ftp"] == 280
        assert data["ftp_tests"][0]["method"] == "manual"

    async def test_updating_ftp_twice_preserves_history(self, client, auth_headers):
        await client.put("/api/athlete/", json={"ftp": 250}, headers=auth_headers)
        resp = await client.put("/api/athlete/", json={"ftp": 280}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["ftp"] == 280
        assert len(data["ftp_tests"]) == 2

    async def test_partial_update_leaves_other_fields_unchanged(self, client, auth_headers):
        await client.put("/api/athlete/", json={"ftp": 300, "max_hr": 185}, headers=auth_headers)
        resp = await client.put("/api/athlete/", json={"name": "Test Rider"}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Rider"
        assert data["ftp"] == 300
        assert data["max_hr"] == 185

    async def test_update_hr_zones(self, client, auth_headers):
        zones = [
            {"low": 0, "high": 130, "name": "Z1"},
            {"low": 130, "high": 155, "name": "Z2"},
        ]
        resp = await client.put("/api/athlete/", json={"hr_zones": zones}, headers=auth_headers)
        assert resp.status_code == 200
        assert len(resp.json()["hr_zones"]) == 2

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.put("/api/athlete/", json={"ftp": 300})
        assert resp.status_code == 401


class TestExportAthlete:
    async def test_export_returns_zip(self, client, auth_headers):
        resp = await client.get("/api/athlete/export", headers=auth_headers)
        assert resp.status_code == 200
        assert "application/zip" in resp.headers["content-type"]

    async def test_export_zip_contains_profile_json(self, client, auth_headers):
        await client.put(
            "/api/athlete/",
            json={"ftp": 280, "name": "Test Rider"},
            headers=auth_headers,
        )
        resp = await client.get("/api/athlete/export", headers=auth_headers)
        assert resp.status_code == 200

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            assert "profile.json" in zf.namelist()
            profile = json.loads(zf.read("profile.json"))
        assert profile["ftp"] == 280
        assert profile["name"] == "Test Rider"
        assert "username" in profile
        assert "exported_at" in profile

    async def test_export_zip_contains_activities_json(self, client, auth_headers):
        for i in range(2):
            await client.post(
                "/api/activities/",
                json={
                    "sport_type": "Ride",
                    "start_time": f"2025-06-0{i + 1}T10:00:00Z",
                    "duration_s": 3600,
                },
                headers=auth_headers,
            )

        resp = await client.get("/api/athlete/export", headers=auth_headers)
        assert resp.status_code == 200

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            assert "activities.json" in zf.namelist()
            activities = json.loads(zf.read("activities.json"))
        assert len(activities) == 2

    async def test_export_empty_activities_still_valid_zip(self, client, auth_headers):
        resp = await client.get("/api/athlete/export", headers=auth_headers)
        assert resp.status_code == 200

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            names = zf.namelist()
        assert "profile.json" in names
        assert "activities.json" in names

    async def test_export_unauthenticated_returns_401(self, client):
        resp = await client.get("/api/athlete/export")
        assert resp.status_code == 401

    @pytest.mark.skipif(not SAMPLE_FIT.exists(), reason="FIT fixture not found")
    async def test_export_decrypts_encrypted_fit_files(self, client, auth_headers, session):
        """Exported zip contains valid (decrypted) FIT bytes even when files are encrypted at rest."""
        from backend.app.core import config as cfg
        from backend.app.core.file_encryption import encrypt_file
        from backend.app.models.orm import Activity, Athlete

        test_key = Fernet.generate_key().decode()

        with open(SAMPLE_FIT, "rb") as f:
            upload_resp = await client.post(
                "/api/activities/upload",
                files={"file": ("test.fit", f, "application/octet-stream")},
                headers=auth_headers,
            )
        assert upload_resp.status_code == 201
        activity_id = upload_resp.json()["id"]

        from backend.app.models.orm import ActivitySource
        act_result = await session.execute(select(Activity).where(Activity.id == activity_id))
        activity = act_result.scalar_one()
        src_result = await session.execute(
            select(ActivitySource).where(
                ActivitySource.activity_id == activity_id,
                ActivitySource.provider == "upload",
            )
        )
        upload_src = src_result.scalar_one()
        ath_result = await session.execute(select(Athlete).where(Athlete.id == activity.athlete_id))
        athlete = ath_result.scalar_one()

        original_bytes = SAMPLE_FIT.read_bytes()

        with patch.object(cfg.settings, "encryption_key", test_key):
            encrypt_file(Path(upload_src.fit_file_path), athlete.user_id)
            upload_src.fit_file_encrypted = True
            await session.commit()

            resp = await client.get("/api/athlete/export", headers=auth_headers)

        assert resp.status_code == 200
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            fit_names = [n for n in zf.namelist() if n.startswith("fit_files/")]
            assert len(fit_names) == 1
            exported_bytes = zf.read(fit_names[0])

        assert exported_bytes == original_bytes


# ── Avatar fixture ─────────────────────────────────────────────────────────────

@pytest.fixture
def avatar_dir(tmp_path):
    """Redirect avatar storage to a temp directory for the duration of the test."""
    d = tmp_path / "avatars"
    with patch("backend.app.api.athlete._AVATAR_DIR", d):
        yield d


# ── Avatar tests ───────────────────────────────────────────────────────────────

class TestAvatar:
    async def test_avatar_url_is_null_by_default(self, client, auth_headers):
        resp = await client.get("/api/athlete/", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["avatar_url"] is None

    async def test_upload_jpeg_returns_populated_avatar_url(self, client, auth_headers, avatar_dir):
        resp = await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("photo.jpg", b"fake-jpeg", "image/jpeg")},
        )
        assert resp.status_code == 200
        url = resp.json()["avatar_url"]
        assert url is not None
        assert "avatar" in url

    async def test_upload_png_accepted(self, client, auth_headers, avatar_dir):
        resp = await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("photo.png", b"fake-png", "image/png")},
        )
        assert resp.status_code == 200
        assert resp.json()["avatar_url"] is not None

    async def test_upload_webp_accepted(self, client, auth_headers, avatar_dir):
        resp = await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("photo.webp", b"fake-webp", "image/webp")},
        )
        assert resp.status_code == 200

    async def test_upload_unsupported_content_type_returns_400(self, client, auth_headers, avatar_dir):
        resp = await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("doc.pdf", b"pdf-bytes", "application/pdf")},
        )
        assert resp.status_code == 400
        assert "Unsupported" in resp.json()["detail"]

    async def test_upload_too_large_returns_400(self, client, auth_headers, avatar_dir):
        big = b"x" * (5 * 1024 * 1024 + 1)
        resp = await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("big.jpg", big, "image/jpeg")},
        )
        assert resp.status_code == 400
        assert "too large" in resp.json()["detail"].lower()

    async def test_upload_unauthenticated_returns_401(self, client, avatar_dir):
        resp = await client.post(
            "/api/athlete/avatar",
            files={"file": ("photo.jpg", b"bytes", "image/jpeg")},
        )
        assert resp.status_code == 401

    async def test_get_avatar_requires_no_auth(self, client, auth_headers, avatar_dir):
        await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("photo.jpg", b"image-data", "image/jpeg")},
        )
        athlete_id = (await client.get("/api/athlete/", headers=auth_headers)).json()["id"]
        resp = await client.get(f"/api/athlete/{athlete_id}/avatar")
        assert resp.status_code == 200

    async def test_get_avatar_returns_exact_uploaded_bytes(self, client, auth_headers, avatar_dir):
        image_bytes = b"\xff\xd8\xff\xe0fake-jpeg-content"
        await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("photo.jpg", image_bytes, "image/jpeg")},
        )
        athlete_id = (await client.get("/api/athlete/", headers=auth_headers)).json()["id"]
        resp = await client.get(f"/api/athlete/{athlete_id}/avatar")
        assert resp.status_code == 200
        assert resp.content == image_bytes

    async def test_get_avatar_unknown_athlete_returns_404(self, client):
        resp = await client.get("/api/athlete/does-not-exist/avatar")
        assert resp.status_code == 404

    async def test_get_avatar_when_none_set_returns_404(self, client, auth_headers):
        athlete_id = (await client.get("/api/athlete/", headers=auth_headers)).json()["id"]
        resp = await client.get(f"/api/athlete/{athlete_id}/avatar")
        assert resp.status_code == 404

    async def test_delete_avatar_clears_avatar_url(self, client, auth_headers, avatar_dir):
        await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("photo.jpg", b"bytes", "image/jpeg")},
        )
        resp = await client.delete("/api/athlete/avatar", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["avatar_url"] is None

    async def test_delete_avatar_removes_file_from_disk(self, client, auth_headers, avatar_dir):
        await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("photo.jpg", b"bytes", "image/jpeg")},
        )
        await client.delete("/api/athlete/avatar", headers=auth_headers)
        remaining = list(avatar_dir.glob("*")) if avatar_dir.exists() else []
        assert remaining == []

    async def test_delete_with_no_avatar_is_idempotent(self, client, auth_headers):
        resp = await client.delete("/api/athlete/avatar", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["avatar_url"] is None

    async def test_delete_avatar_unauthenticated_returns_401(self, client):
        resp = await client.delete("/api/athlete/avatar")
        assert resp.status_code == 401

    async def test_upload_replaces_old_file_on_extension_change(self, client, auth_headers, avatar_dir):
        await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("first.jpg", b"first", "image/jpeg")},
        )
        await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("second.png", b"second", "image/png")},
        )
        files = list(avatar_dir.glob("*"))
        assert len(files) == 1
        assert files[0].suffix == ".png"

    async def test_avatar_url_includes_athlete_id(self, client, auth_headers, avatar_dir):
        athlete_id = (await client.get("/api/athlete/", headers=auth_headers)).json()["id"]
        resp = await client.post(
            "/api/athlete/avatar",
            headers=auth_headers,
            files={"file": ("photo.jpg", b"bytes", "image/jpeg")},
        )
        assert athlete_id in resp.json()["avatar_url"]
