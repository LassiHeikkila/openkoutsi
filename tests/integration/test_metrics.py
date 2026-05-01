"""
Integration tests for /api/metrics endpoints.
"""
import uuid
from datetime import date, timedelta

from sqlalchemy import select

from backend.app.models.team_orm import DailyMetric, Athlete


class TestGetFitness:
    async def test_empty_for_new_athlete(self, client, auth_headers):
        resp = await client.get("/api/metrics/fitness", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_returns_inserted_metrics(self, client, auth_headers, session):
        # Get the athlete ID
        ath_resp = await client.get("/api/athlete/", headers=auth_headers)
        athlete_id = ath_resp.json()["id"]
        today = date.today()

        metric = DailyMetric(
            athlete_id=athlete_id,
            date=today,
            ctl=30.0,
            atl=40.0,
            tsb=-10.0,
            tss_day=80.0,
        )
        session.add(metric)
        await session.commit()

        resp = await client.get("/api/metrics/fitness", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["ctl"] == 30.0
        assert data[0]["atl"] == 40.0

    async def test_days_filter_limits_results(self, client, auth_headers, session):
        ath_resp = await client.get("/api/athlete/", headers=auth_headers)
        athlete_id = ath_resp.json()["id"]
        today = date.today()

        for offset in [60, 10, 1]:
            session.add(DailyMetric(
                athlete_id=athlete_id,
                date=today - timedelta(days=offset),
                ctl=10.0, atl=10.0, tsb=0.0, tss_day=50.0,
            ))
        await session.commit()

        resp = await client.get("/api/metrics/fitness?days=30", headers=auth_headers)
        data = resp.json()
        # Only the metrics from last 30 days should be returned
        assert len(data) == 2  # 10 and 1 days ago

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.get("/api/metrics/fitness")
        assert resp.status_code == 401


class TestGetFitnessCurrent:
    async def test_returns_zeros_when_no_metrics(self, client, auth_headers):
        resp = await client.get("/api/metrics/fitness/current", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["ctl"] == 0.0
        assert data["atl"] == 0.0
        assert data["tsb"] == 0.0
        assert "form" in data

    async def test_form_label_computed_from_tsb(self, client, auth_headers, session):
        ath_resp = await client.get("/api/athlete/", headers=auth_headers)
        athlete_id = ath_resp.json()["id"]
        today = date.today()

        # TSB > 25 → "peak"
        session.add(DailyMetric(
            athlete_id=athlete_id, date=today,
            ctl=50.0, atl=20.0, tsb=30.0, tss_day=0.0,
        ))
        await session.commit()

        resp = await client.get("/api/metrics/fitness/current", headers=auth_headers)
        assert resp.json()["form"] == "peak"

    async def test_tired_form_label(self, client, auth_headers, session):
        ath_resp = await client.get("/api/athlete/", headers=auth_headers)
        athlete_id = ath_resp.json()["id"]
        today = date.today()

        session.add(DailyMetric(
            athlete_id=athlete_id, date=today,
            ctl=40.0, atl=60.0, tsb=-20.0, tss_day=0.0,
        ))
        await session.commit()

        resp = await client.get("/api/metrics/fitness/current", headers=auth_headers)
        assert resp.json()["form"] == "tired"

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.get("/api/metrics/fitness/current")
        assert resp.status_code == 401


class TestRecalculate:
    async def test_returns_202_immediately(self, client, auth_headers):
        resp = await client.post("/api/metrics/recalculate", headers=auth_headers)
        assert resp.status_code == 202
        assert resp.json()["status"] == "recalculation started"

    async def test_unauthenticated_returns_401(self, client):
        resp = await client.post("/api/metrics/recalculate")
        assert resp.status_code == 401
