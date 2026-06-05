"""
Integration tests for /api/plans endpoints.
"""
import json
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock, patch


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


# ── LLM plan generation ────────────────────────────────────────────────────────

def _make_llm_plan_json(num_weeks=4) -> str:
    """Build a minimal valid LLM response for num_weeks weeks."""
    weeks = []
    for w in range(1, num_weeks + 1):
        workouts = []
        for day in range(1, 8):
            if day in (2, 4, 6):
                workouts.append({"day_of_week": day, "workout_type": "endurance",
                                  "description": "Easy ride", "duration_min": 60, "target_tss": 50})
            else:
                workouts.append({"day_of_week": day, "workout_type": "rest",
                                  "description": None, "duration_min": None, "target_tss": None})
        weeks.append({"week_number": w, "workouts": workouts})
    return json.dumps({"weeks": weeks})


_LLM_REQUEST_BODY = {
    "name": "LLM Plan",
    "start_date": str(_START),
    "weeks": 4,
    "use_llm": True,
    "config": {
        "days_per_week": 3,
        "day_configs": [
            {"day_of_week": 2, "workout_type": "endurance"},
            {"day_of_week": 4, "workout_type": "threshold"},
            {"day_of_week": 6, "workout_type": "long"},
        ],
        "periodization": "base_building",
        "intensity_preference": "moderate",
    },
}


class TestLlmPlanGeneration:
    async def _mock_llm_call(self, raw_json: str):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {"choices": [{"message": {"content": raw_json}}]}

        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=mock_resp)
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)
        return mock_http

    async def test_llm_plan_created_when_url_configured(self, client, auth_headers, session):
        from sqlalchemy import select as sa_select
        from backend.app.models.team_orm import Athlete

        # Set LLM URL on athlete
        await client.put(
            "/api/athlete/",
            json={"app_settings": {"llm_base_url": "http://localhost:11434/v1",
                                   "llm_model": "llama3.2"}},
            headers=auth_headers,
        )

        mock_http = await self._mock_llm_call(_make_llm_plan_json(4))

        with patch("httpx.AsyncClient", return_value=mock_http):
            resp = await client.post("/api/plans/", json=_LLM_REQUEST_BODY, headers=auth_headers)

        assert resp.status_code == 201
        data = resp.json()
        assert data["generation_method"] == "llm"
        assert len(data["workouts"]) == 28  # 4 weeks × 7 days

    async def test_llm_plan_retries_on_parse_failure(self, client, auth_headers):
        await client.put(
            "/api/athlete/",
            json={"app_settings": {"llm_base_url": "http://localhost:11434/v1",
                                   "llm_model": "llama3.2"}},
            headers=auth_headers,
        )

        # First call returns garbage, second returns valid JSON
        bad_resp = MagicMock()
        bad_resp.raise_for_status = MagicMock()
        bad_resp.json.return_value = {"choices": [{"message": {"content": "not json at all"}}]}

        good_resp = MagicMock()
        good_resp.raise_for_status = MagicMock()
        good_resp.json.return_value = {"choices": [{"message": {"content": _make_llm_plan_json(4)}}]}

        mock_http = AsyncMock()
        mock_http.post = AsyncMock(side_effect=[bad_resp, good_resp])
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_http):
            resp = await client.post("/api/plans/", json=_LLM_REQUEST_BODY, headers=auth_headers)

        assert resp.status_code == 201
        assert resp.json()["generation_method"] == "llm"

    async def test_llm_plan_fails_gracefully_on_double_parse_error(self, client, auth_headers):
        await client.put(
            "/api/athlete/",
            json={"app_settings": {"llm_base_url": "http://localhost:11434/v1",
                                   "llm_model": "llama3.2"}},
            headers=auth_headers,
        )

        bad_resp = MagicMock()
        bad_resp.raise_for_status = MagicMock()
        bad_resp.json.return_value = {"choices": [{"message": {"content": "still not json"}}]}

        mock_http = AsyncMock()
        mock_http.post = AsyncMock(return_value=bad_resp)
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_http):
            resp = await client.post("/api/plans/", json=_LLM_REQUEST_BODY, headers=auth_headers)

        # API returns 4xx/5xx when both LLM attempts produce unparseable JSON
        assert resp.status_code >= 400

    async def test_build_user_prompt_includes_ftp(self, client, auth_headers):
        from backend.app.services.llm_plan_generator import _build_user_prompt
        from backend.app.schemas.plans import PlanConfig, DayConfig

        config = PlanConfig(
            days_per_week=3,
            day_configs=[DayConfig(day_of_week=2, workout_type="endurance")],
            periodization="base_building",
            intensity_preference="moderate",
        )
        prompt = _build_user_prompt(config, "Gran Fondo 2025", 8, 280, 45.0)
        assert "280" in prompt  # FTP
        assert "45.0" in prompt  # CTL
        assert "Gran Fondo" in prompt

    async def test_extract_json_strips_markdown_fences(self):
        from backend.app.services.llm_plan_generator import _extract_json
        raw = '```json\n{"foo": "bar"}\n```'
        assert _extract_json(raw) == '{"foo": "bar"}'

    async def test_parse_response_validates_week_count(self):
        from backend.app.services.llm_plan_generator import _parse_response
        import pytest
        valid = _make_llm_plan_json(4)
        with pytest.raises(ValueError, match="Expected 6 weeks"):
            _parse_response(valid, 6)


class TestSkipWorkout:
    async def _create_plan_and_get_workout(self, client, auth_headers):
        resp = await client.post(
            "/api/plans/",
            json={"name": "Skip Test Plan", "start_date": str(_START), "weeks": 1},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        plan = resp.json()
        workout = next(w for w in plan["workouts"] if w["workout_type"] != "rest")
        return plan["id"], workout["id"]

    async def test_skip_sets_reason(self, client, auth_headers):
        plan_id, workout_id = await self._create_plan_and_get_workout(client, auth_headers)
        resp = await client.put(
            f"/api/plans/{plan_id}/workouts/{workout_id}/skip",
            json={"reason": "illness"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["skip_reason"] == "illness"

    async def test_skip_reason_persists_in_plan_response(self, client, auth_headers):
        plan_id, workout_id = await self._create_plan_and_get_workout(client, auth_headers)
        await client.put(
            f"/api/plans/{plan_id}/workouts/{workout_id}/skip",
            json={"reason": "Travel"},
            headers=auth_headers,
        )
        resp = await client.get(f"/api/plans/{plan_id}", headers=auth_headers)
        assert resp.status_code == 200
        workout = next(w for w in resp.json()["workouts"] if w["id"] == workout_id)
        assert workout["skip_reason"] == "Travel"

    async def test_clear_skip_removes_reason(self, client, auth_headers):
        plan_id, workout_id = await self._create_plan_and_get_workout(client, auth_headers)
        await client.put(
            f"/api/plans/{plan_id}/workouts/{workout_id}/skip",
            json={"reason": "busy"},
            headers=auth_headers,
        )
        resp = await client.delete(
            f"/api/plans/{plan_id}/workouts/{workout_id}/skip",
            headers=auth_headers,
        )
        assert resp.status_code == 204

        plan_resp = await client.get(f"/api/plans/{plan_id}", headers=auth_headers)
        workout = next(w for w in plan_resp.json()["workouts"] if w["id"] == workout_id)
        assert workout["skip_reason"] is None

    async def test_skip_unknown_plan_returns_404(self, client, auth_headers):
        resp = await client.put(
            "/api/plans/nonexistent/workouts/nonexistent/skip",
            json={"reason": "illness"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_skip_unknown_workout_returns_404(self, client, auth_headers):
        plan_id, _ = await self._create_plan_and_get_workout(client, auth_headers)
        resp = await client.put(
            f"/api/plans/{plan_id}/workouts/nonexistent/skip",
            json={"reason": "illness"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_unauthenticated_returns_401(self, client, auth_headers):
        plan_id, workout_id = await self._create_plan_and_get_workout(client, auth_headers)
        resp = await client.put(
            f"/api/plans/{plan_id}/workouts/{workout_id}/skip",
            json={"reason": "illness"},
        )
        assert resp.status_code == 401
