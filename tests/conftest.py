"""
Shared fixtures for the test suite.

DB strategy: every test function gets a fresh in-memory SQLite engine so tests
are fully isolated without any rollback tricks.

Background tasks: suppressed via mock so they never touch the production DB.
Tests that need background-task logic (e.g. FIT processing) call the service
functions directly with the test session.
"""
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Ensure project root is importable (needed when running from a subdirectory)
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.app.db.base import Base, get_session
from backend.main import create_app

TESTDATA_DIR = Path(__file__).parent.parent / "testdata"


async def _register(client: AsyncClient, email: str, password: str = "testpass123") -> dict:
    """Register a user and return auth headers with the token."""
    resp = await client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def engine():
    """Fresh in-memory SQLite engine with schema created. Function-scoped for isolation."""
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def session(engine):
    """Async session bound to the test engine."""
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        yield s


@pytest.fixture
async def client(session):
    """
    HTTP test client wired to the test DB session.

    - `get_session` dependency is overridden to use the test session.
    - Background tasks are suppressed (mocked out) so they never touch
      the production SQLite file.
    """
    app = create_app()

    async def _override_get_session():
        yield session

    app.dependency_overrides[get_session] = _override_get_session

    with patch("starlette.background.BackgroundTasks.add_task"):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c

    app.dependency_overrides.clear()


@pytest.fixture
async def auth_headers(client):
    """Auth headers for a registered test athlete."""
    return await _register(client, "athlete@test.com")
