"""
Integration tests for /api/plans endpoints.
"""
from datetime import date, timedelta


_START = date(2025, 6, 2)  # A Monday


class TestCreatePlan:
    async def test_creates_rule_based_plan_with_correct_structure(self, client, auth_headers):
        resp = await client.post(
            "/api/plans/",
            json={"name": "Base Build", "start_date": str(_START), "weeks": 8},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Base Build"
        assert data["generation_method"] == "rule_based"
        assert data["status"] == "active"
        assert len(data["workouts"]) == 56  # 8 weeks × 7 days

    def _expected_end_date(self, start: date, weeks: int) -> str:
        return str(start + timedelta(weeks=weeks) - timedelta(days=1))

    async def test_end_date_calculated_correctly(self, client, auth_headers):
        resp = await client.post(
            "/api/plans/",
            json={"name": "Plan", "start_date": str(_START), "weeks": 8},
            headers=auth_headers,
        )
        assert resp.json()["end_date"] == self._expected_end_date(_START, 8)

    async def test_creating_second_plan_archives_first(self, client, auth_headers):
        resp1 = await client.post(
            "/api/plans/",
            json={"name": "Plan 1", "start_date": str(_START), "weeks": 4},
            headers=auth_headers,
        )
        plan1_id = resp1.json()["id"]

        await client.post(
            "/api/plans/",
            json={"name": "Plan 2", "start_date": str(_START), "weeks": 4},
            headers=auth_headers,
        )

        # First plan should now be archived
        resp = await client.get(f"/api/plans/{plan1_id}", headers=auth_headers)
        assert resp.json()["status"] == "archived"

    async def test_llm_without_configured_url_returns_400(self, client, auth_headers):
        resp = await client.post(
            "/api/plans/",
            json={
                "name": "LLM Plan",
                "start_date": str(_START),
                "weeks": 4,
                "use_llm": True,
                "config": {
                    "days_per_week": 3,
                    "day_configs": [{"day_of_week": 2, "workout_type": "threshold"}],
                    "periodization": "base_building",
                    "intensity_preference": "moderate",
                },
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.post(
            "/api/plans/",
            json={"name": "X", "start_date": str(_START)},
        )
        assert resp.status_code == 401


class TestGetPlan:
    async def test_returns_plan_with_workouts(self, client, auth_headers):
        create_resp = await client.post(
            "/api/plans/",
            json={"name": "My Plan", "start_date": str(_START), "weeks": 4},
            headers=auth_headers,
        )
        plan_id = create_resp.json()["id"]

        resp = await client.get(f"/api/plans/{plan_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == plan_id
        assert len(data["workouts"]) == 28

    async def test_nonexistent_plan_returns_404(self, client, auth_headers):
        resp = await client.get("/api/plans/no-such-id", headers=auth_headers)
        assert resp.status_code == 404

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.get("/api/plans/some-id")
        assert resp.status_code == 401


class TestUpdatePlan:
    async def test_update_plan_name(self, client, auth_headers):
        create_resp = await client.post(
            "/api/plans/",
            json={"name": "Old Name", "start_date": str(_START), "weeks": 4},
            headers=auth_headers,
        )
        plan_id = create_resp.json()["id"]

        resp = await client.put(
            f"/api/plans/{plan_id}",
            json={"name": "New Name"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    async def test_archive_plan(self, client, auth_headers):
        create_resp = await client.post(
            "/api/plans/",
            json={"name": "Active Plan", "start_date": str(_START), "weeks": 4},
            headers=auth_headers,
        )
        plan_id = create_resp.json()["id"]

        resp = await client.put(
            f"/api/plans/{plan_id}",
            json={"status": "archived"},
            headers=auth_headers,
        )
        assert resp.json()["status"] == "archived"

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.put("/api/plans/some-id", json={"name": "X"})
        assert resp.status_code == 401


class TestDeletePlan:
    async def test_delete_plan_returns_204(self, client, auth_headers):
        create_resp = await client.post(
            "/api/plans/",
            json={"name": "Deletable", "start_date": str(_START), "weeks": 4},
            headers=auth_headers,
        )
        plan_id = create_resp.json()["id"]
        resp = await client.delete(f"/api/plans/{plan_id}", headers=auth_headers)
        assert resp.status_code == 204

    async def test_deleted_plan_returns_404(self, client, auth_headers):
        create_resp = await client.post(
            "/api/plans/",
            json={"name": "Gone", "start_date": str(_START), "weeks": 4},
            headers=auth_headers,
        )
        plan_id = create_resp.json()["id"]
        await client.delete(f"/api/plans/{plan_id}", headers=auth_headers)
        resp = await client.get(f"/api/plans/{plan_id}", headers=auth_headers)
        assert resp.status_code == 404

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.delete("/api/plans/some-id")
        assert resp.status_code == 401
