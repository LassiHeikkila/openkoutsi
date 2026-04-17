import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from backend.app.core.config import settings
from backend.app.core.limiter import limiter
from backend.app.db.base import Base, engine

log = logging.getLogger(__name__)


async def _apply_column_migrations(conn) -> None:
    """Add columns/tables that were introduced after the initial schema creation."""
    from sqlalchemy import text

    # New tables
    result = await conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='provider_connections'")
    )
    if result.fetchone() is None:
        log.info("Schema migration: creating table provider_connections")
        await conn.execute(text(
            "CREATE TABLE provider_connections ("
            "  id VARCHAR NOT NULL PRIMARY KEY,"
            "  athlete_id VARCHAR NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,"
            "  provider VARCHAR NOT NULL,"
            "  provider_athlete_id VARCHAR,"
            "  access_token VARCHAR,"
            "  refresh_token VARCHAR,"
            "  token_expires_at DATETIME,"
            "  scopes VARCHAR,"
            "  created_at DATETIME NOT NULL,"
            "  updated_at DATETIME NOT NULL,"
            "  UNIQUE (athlete_id, provider)"
            ")"
        ))
        # Migrate existing Strava tokens from athletes table (if columns exist)
        result2 = await conn.execute(text("PRAGMA table_info(athletes)"))
        athlete_cols = {row[1] for row in result2.fetchall()}
        if "strava_athlete_id" in athlete_cols:
            log.info("Schema migration: migrating Strava tokens to provider_connections")
            from datetime import datetime, timezone
            now_iso = datetime.now(timezone.utc).isoformat()
            await conn.execute(text(
                "INSERT INTO provider_connections "
                "  (id, athlete_id, provider, provider_athlete_id, access_token, "
                "   refresh_token, token_expires_at, created_at, updated_at) "
                "SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || "
                "       hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),"
                "  id, 'strava', strava_athlete_id, strava_access_token,"
                "  strava_refresh_token, strava_token_expires_at,"
                f"  '{now_iso}', '{now_iso}'"
                " FROM athletes WHERE strava_athlete_id IS NOT NULL"
            ))

    # New columns on existing tables
    # New table: activity_power_bests
    result = await conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='activity_power_bests'")
    )
    if result.fetchone() is None:
        log.info("Schema migration: creating table activity_power_bests")
        await conn.execute(text(
            "CREATE TABLE activity_power_bests ("
            "  id VARCHAR NOT NULL PRIMARY KEY,"
            "  activity_id VARCHAR NOT NULL REFERENCES activities(id) ON DELETE CASCADE,"
            "  athlete_id VARCHAR NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,"
            "  duration_s INTEGER NOT NULL,"
            "  power_w REAL NOT NULL,"
            "  activity_start_time DATETIME,"
            "  UNIQUE (activity_id, duration_s)"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX ix_activity_power_bests_athlete_id "
            "ON activity_power_bests (athlete_id)"
        ))

    # New table: activity_distance_bests
    result = await conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='activity_distance_bests'")
    )
    if result.fetchone() is None:
        log.info("Schema migration: creating table activity_distance_bests")
        await conn.execute(text(
            "CREATE TABLE activity_distance_bests ("
            "  id VARCHAR NOT NULL PRIMARY KEY,"
            "  activity_id VARCHAR NOT NULL REFERENCES activities(id) ON DELETE CASCADE,"
            "  athlete_id VARCHAR NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,"
            "  distance_m INTEGER NOT NULL,"
            "  time_s INTEGER NOT NULL,"
            "  activity_start_time DATETIME,"
            "  UNIQUE (activity_id, distance_m)"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX ix_activity_distance_bests_athlete_id "
            "ON activity_distance_bests (athlete_id)"
        ))

    migrations = [
        ("training_plans", "config", "ALTER TABLE training_plans ADD COLUMN config JSON"),
        ("training_plans", "generation_method", "ALTER TABLE training_plans ADD COLUMN generation_method VARCHAR"),
        ("activities", "analysis_status", "ALTER TABLE activities ADD COLUMN analysis_status VARCHAR"),
        ("activities", "analysis", "ALTER TABLE activities ADD COLUMN analysis TEXT"),
        ("athletes", "app_settings", "ALTER TABLE athletes ADD COLUMN app_settings JSON"),
        ("athletes", "avatar_path", "ALTER TABLE athletes ADD COLUMN avatar_path VARCHAR"),
        ("activities", "external_id", "ALTER TABLE activities ADD COLUMN external_id VARCHAR"),
        ("activities", "fit_file_encrypted", "ALTER TABLE activities ADD COLUMN fit_file_encrypted BOOLEAN DEFAULT 0"),
    ]
    for table, column, ddl in migrations:
        result = await conn.execute(text(f"PRAGMA table_info({table})"))
        existing = {row[1] for row in result.fetchall()}
        if column not in existing:
            log.info("Schema migration: adding column %s.%s", table, column)
            await conn.execute(text(ddl))


@asynccontextmanager
async def lifespan(app: FastAPI):
    from backend.app.api.strava import strava_bridge_poller

    if settings.init_db:
        log.info("INIT_DB=true: running create_all to initialise database tables")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    else:
        log.info(
            "Skipping automatic DDL (set INIT_DB=true for a fresh install, "
            "or use Alembic for migrations)"
        )

    async with engine.begin() as conn:
        await _apply_column_migrations(conn)

    # Start Strava bridge poller (no-ops if bridge not configured)
    poller = asyncio.create_task(strava_bridge_poller())

    yield

    poller.cancel()
    try:
        await poller
    except asyncio.CancelledError:
        pass


def create_app() -> FastAPI:
    from backend.app.api.auth import router as auth_router
    from backend.app.api.athlete import router as athlete_router
    from backend.app.api.activities import router as activities_router
    from backend.app.api.integrations import router as integrations_router
    from backend.app.api.metrics import router as metrics_router
    from backend.app.api.goals import router as goals_router
    from backend.app.api.distance import router as distance_router
    from backend.app.api.power import router as power_router
    from backend.app.api.strava import router as strava_router
    from backend.app.api.plans import router as plans_router

    app = FastAPI(title="openkoutsi API", version="1.0.0", lifespan=lifespan)

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
    )

    app.include_router(auth_router, prefix="/api")
    app.include_router(athlete_router, prefix="/api")
    app.include_router(activities_router, prefix="/api")
    app.include_router(integrations_router, prefix="/api")
    app.include_router(metrics_router, prefix="/api")
    app.include_router(goals_router, prefix="/api")
    app.include_router(distance_router, prefix="/api")
    app.include_router(power_router, prefix="/api")
    app.include_router(strava_router, prefix="/api")
    app.include_router(plans_router, prefix="/api")

    return app


app = create_app()
