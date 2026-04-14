"""
Integration tests for /api/auth endpoints.

Tests cover registration, login, token refresh, and account deletion.
"""
import pytest

# All passwords used in tests must meet the strength policy:
# - min 12 characters, at least one uppercase letter, at least one digit
_GOOD_PW = "Testpass1234"
_GOOD_PW2 = "Mypassword12"


class TestRegister:
    async def test_valid_registration_returns_access_token(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={"email": "new@example.com", "password": _GOOD_PW},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        # Refresh token is now in an httpOnly cookie, not the response body
        assert "refresh_token" not in data

    async def test_register_sets_refresh_cookie(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={"email": "cookie@example.com", "password": _GOOD_PW},
        )
        assert resp.status_code == 201
        assert "refresh_token" in resp.cookies

    async def test_duplicate_email_returns_400(self, client):
        payload = {"email": "dup@example.com", "password": _GOOD_PW}
        await client.post("/api/auth/register", json=payload)
        resp = await client.post("/api/auth/register", json=payload)
        assert resp.status_code == 400

    async def test_invalid_email_returns_422(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={"email": "not-an-email", "password": _GOOD_PW},
        )
        assert resp.status_code == 422

    async def test_missing_password_returns_422(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={"email": "ok@example.com"},
        )
        assert resp.status_code == 422

    async def test_weak_password_no_uppercase_returns_422(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={"email": "weak@example.com", "password": "password1234"},
        )
        assert resp.status_code == 422

    async def test_weak_password_too_short_returns_422(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={"email": "short@example.com", "password": "Short1"},
        )
        assert resp.status_code == 422

    async def test_weak_password_no_digit_returns_422(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={"email": "nodigit@example.com", "password": "Passwordwithoutdigit"},
        )
        assert resp.status_code == 422


class TestLogin:
    async def test_valid_credentials_returns_access_token(self, client):
        email = "login@example.com"
        await client.post("/api/auth/register", json={"email": email, "password": _GOOD_PW})

        resp = await client.post("/api/auth/login", json={"email": email, "password": _GOOD_PW})
        assert resp.status_code == 200
        assert "access_token" in resp.json()
        assert "refresh_token" in resp.cookies

    async def test_wrong_password_returns_401(self, client):
        await client.post(
            "/api/auth/register",
            json={"email": "real@example.com", "password": _GOOD_PW},
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
            json={"email": "athlete@test.com", "password": "Testpass1234"},
        )
        assert resp.status_code == 401


class TestRefresh:
    async def test_valid_cookie_returns_new_access_token(self, client):
        # Register — httpx client stores the Set-Cookie automatically
        await client.post(
            "/api/auth/register",
            json={"email": "ref@example.com", "password": _GOOD_PW},
        )

        # Refresh uses the cookie stored in the client session (no body needed)
        resp = await client.post("/api/auth/refresh")
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" not in data  # token is in cookie, not body
        assert "refresh_token" in resp.cookies  # rotated cookie is set

    async def test_no_cookie_returns_401(self, client):
        resp = await client.post("/api/auth/refresh")
        assert resp.status_code == 401

    async def test_access_token_as_cookie_returns_401(self, client):
        reg_resp = await client.post(
            "/api/auth/register",
            json={"email": "badref@example.com", "password": _GOOD_PW},
        )
        access_token = reg_resp.json()["access_token"]

        # Clear the valid refresh cookie, then set the access token in its place
        client.cookies.clear()
        client.cookies.set("refresh_token", access_token, domain="test", path="/api/auth")
        resp = await client.post("/api/auth/refresh")
        assert resp.status_code == 401

    async def test_invalid_token_string_returns_401(self, client):
        client.cookies.clear()
        client.cookies.set("refresh_token", "not.a.jwt", domain="test", path="/api/auth")
        resp = await client.post("/api/auth/refresh")
        assert resp.status_code == 401


class TestLogout:
    async def test_logout_clears_cookie(self, client):
        await client.post(
            "/api/auth/register",
            json={"email": "logout@example.com", "password": _GOOD_PW},
        )
        resp = await client.post("/api/auth/logout")
        assert resp.status_code == 204
        # After logout, refresh should fail
        resp2 = await client.post("/api/auth/refresh")
        assert resp2.status_code == 401


class TestDeleteAccount:
    async def test_delete_account_returns_204(self, client, auth_headers):
        resp = await client.delete("/api/auth/account", headers=auth_headers)
        assert resp.status_code == 204

    async def test_deleted_account_cannot_login(self, client, auth_headers):
        await client.delete("/api/auth/account", headers=auth_headers)
        resp = await client.post(
            "/api/auth/login",
            json={"email": "athlete@test.com", "password": "Testpass1234"},
        )
        assert resp.status_code == 401

    async def test_unauthenticated_delete_returns_401(self, client):
        resp = await client.delete("/api/auth/account")
        assert resp.status_code == 401
