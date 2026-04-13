"""
Integration tests for /api/auth endpoints.

Tests cover registration, login, token refresh, and account deletion.
"""
import pytest


class TestRegister:
    async def test_valid_registration_returns_tokens(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={"email": "new@example.com", "password": "password123"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_duplicate_email_returns_400(self, client):
        payload = {"email": "dup@example.com", "password": "password123"}
        await client.post("/api/auth/register", json=payload)
        resp = await client.post("/api/auth/register", json=payload)
        assert resp.status_code == 400

    async def test_invalid_email_returns_422(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={"email": "not-an-email", "password": "password123"},
        )
        assert resp.status_code == 422

    async def test_missing_password_returns_422(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={"email": "ok@example.com"},
        )
        assert resp.status_code == 422


class TestLogin:
    async def test_valid_credentials_returns_tokens(self, client):
        email, pw = "login@example.com", "mypassword"
        await client.post("/api/auth/register", json={"email": email, "password": pw})

        resp = await client.post("/api/auth/login", json={"email": email, "password": pw})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_wrong_password_returns_401(self, client):
        await client.post(
            "/api/auth/register",
            json={"email": "real@example.com", "password": "correct"},
        )
        resp = await client.post(
            "/api/auth/login",
            json={"email": "real@example.com", "password": "wrong"},
        )
        assert resp.status_code == 401

    async def test_nonexistent_email_returns_401(self, client):
        resp = await client.post(
            "/api/auth/login",
            json={"email": "ghost@example.com", "password": "anything"},
        )
        assert resp.status_code == 401

    async def test_deleted_account_cannot_login(self, client, auth_headers):
        await client.delete("/api/auth/account", headers=auth_headers)
        resp = await client.post(
            "/api/auth/login",
            json={"email": "athlete@test.com", "password": "testpass123"},
        )
        assert resp.status_code == 401


class TestRefresh:
    async def test_valid_refresh_token_returns_new_tokens(self, client):
        reg_resp = await client.post(
            "/api/auth/register",
            json={"email": "ref@example.com", "password": "pass"},
        )
        refresh_token = reg_resp.json()["refresh_token"]

        resp = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_access_token_used_as_refresh_returns_401(self, client):
        reg_resp = await client.post(
            "/api/auth/register",
            json={"email": "badref@example.com", "password": "pass"},
        )
        access_token = reg_resp.json()["access_token"]

        resp = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": access_token},  # wrong token type
        )
        assert resp.status_code == 401

    async def test_invalid_token_string_returns_401(self, client):
        resp = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": "not.a.jwt"},
        )
        assert resp.status_code == 401


class TestDeleteAccount:
    async def test_delete_account_returns_204(self, client, auth_headers):
        resp = await client.delete("/api/auth/account", headers=auth_headers)
        assert resp.status_code == 204

    async def test_deleted_account_cannot_login(self, client, auth_headers):
        await client.delete("/api/auth/account", headers=auth_headers)
        resp = await client.post(
            "/api/auth/login",
            json={"email": "athlete@test.com", "password": "testpass123"},
        )
        assert resp.status_code == 401

    async def test_unauthenticated_delete_returns_401(self, client):
        resp = await client.delete("/api/auth/account")
        assert resp.status_code == 401
