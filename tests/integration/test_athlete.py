"""
Integration tests for /api/athlete endpoints.
"""
import io
import json
import zipfile


class TestGetAthlete:
    async def test_returns_profile_after_registration(self, client, auth_headers):
        resp = await client.get("/api/athlete/", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["hr_zones"] == []
        assert data["power_zones"] == []
        assert data["ftp_tests"] == []
        assert data["strava_connected"] is False

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
        assert "email" in profile
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
