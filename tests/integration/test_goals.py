"""
Integration tests for /api/goals endpoints.
"""


class TestListGoals:
    async def test_empty_list_for_new_athlete(self, client, auth_headers):
        resp = await client.get("/api/goals/", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.get("/api/goals/")
        assert resp.status_code == 401


class TestCreateGoal:
    async def test_creates_goal_with_required_fields(self, client, auth_headers):
        resp = await client.post(
            "/api/goals/",
            json={"title": "First Century"},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "First Century"
        assert data["status"] == "active"
        assert "id" in data
        assert "athlete_id" in data

    async def test_goal_appears_in_list(self, client, auth_headers):
        await client.post("/api/goals/", json={"title": "Goal A"}, headers=auth_headers)
        resp = await client.get("/api/goals/", headers=auth_headers)
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Goal A"

    async def test_missing_title_returns_422(self, client, auth_headers):
        resp = await client.post("/api/goals/", json={}, headers=auth_headers)
        assert resp.status_code == 422

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.post("/api/goals/", json={"title": "X"})
        assert resp.status_code == 401


class TestUpdateGoal:
    async def test_update_goal_fields(self, client, auth_headers):
        create_resp = await client.post(
            "/api/goals/",
            json={"title": "Improve FTP", "target_value": 300.0},
            headers=auth_headers,
        )
        goal_id = create_resp.json()["id"]

        resp = await client.put(
            f"/api/goals/{goal_id}",
            json={"current_value": 280.0, "status": "active"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["current_value"] == 280.0
        assert data["status"] == "active"

    async def test_another_athletes_goal_returns_404(self, client):
        from tests.conftest import _register
        headers_a = await _register(client, "goal_a@test.com")
        headers_b = await _register(client, "goal_b@test.com")

        create_resp = await client.post(
            "/api/goals/",
            json={"title": "Private Goal"},
            headers=headers_a,
        )
        goal_id = create_resp.json()["id"]

        resp = await client.put(
            f"/api/goals/{goal_id}",
            json={"title": "Hijacked"},
            headers=headers_b,
        )
        assert resp.status_code == 404

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.put("/api/goals/some-id", json={"title": "X"})
        assert resp.status_code == 401


class TestDeleteGoal:
    async def test_delete_goal_returns_204(self, client, auth_headers):
        create_resp = await client.post(
            "/api/goals/",
            json={"title": "To Delete"},
            headers=auth_headers,
        )
        goal_id = create_resp.json()["id"]
        resp = await client.delete(f"/api/goals/{goal_id}", headers=auth_headers)
        assert resp.status_code == 204

    async def test_deleted_goal_not_in_list(self, client, auth_headers):
        create_resp = await client.post(
            "/api/goals/",
            json={"title": "Ephemeral"},
            headers=auth_headers,
        )
        goal_id = create_resp.json()["id"]
        await client.delete(f"/api/goals/{goal_id}", headers=auth_headers)
        resp = await client.get("/api/goals/", headers=auth_headers)
        assert resp.json() == []

    async def test_another_athletes_goal_returns_404(self, client):
        from tests.conftest import _register
        headers_a = await _register(client, "del_a@test.com")
        headers_b = await _register(client, "del_b@test.com")

        create_resp = await client.post(
            "/api/goals/",
            json={"title": "Secret Goal"},
            headers=headers_a,
        )
        goal_id = create_resp.json()["id"]

        resp = await client.delete(f"/api/goals/{goal_id}", headers=headers_b)
        assert resp.status_code == 404

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.delete("/api/goals/some-id")
        assert resp.status_code == 401


class TestGoalIsolation:
    async def test_goals_are_isolated_between_athletes(self, client):
        from tests.conftest import _register
        headers_a = await _register(client, "iso_a@test.com")
        headers_b = await _register(client, "iso_b@test.com")

        await client.post("/api/goals/", json={"title": "A's Goal"}, headers=headers_a)
        await client.post("/api/goals/", json={"title": "B's Goal"}, headers=headers_b)

        resp_a = await client.get("/api/goals/", headers=headers_a)
        resp_b = await client.get("/api/goals/", headers=headers_b)

        assert len(resp_a.json()) == 1
        assert resp_a.json()[0]["title"] == "A's Goal"
        assert len(resp_b.json()) == 1
        assert resp_b.json()[0]["title"] == "B's Goal"
