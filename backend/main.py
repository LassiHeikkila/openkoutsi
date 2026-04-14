import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.config import settings
from backend.app.db.base import Base, engine

log = logging.getLogger(__name__)


async def _apply_column_migrations(conn) -> None:
    """Add columns that were introduced after the initial schema creation."""
    from sqlalchemy import text

    migrations = [
        ("training_plans", "config", "ALTER TABLE training_plans ADD COLUMN config JSON"),
        ("training_plans", "generation_method", "ALTER TABLE training_plans ADD COLUMN generation_method VARCHAR"),
        ("activities", "analysis_status", "ALTER TABLE activities ADD COLUMN analysis_status VARCHAR"),
        ("activities", "analysis", "ALTER TABLE activities ADD COLUMN analysis TEXT"),
        ("athletes", "app_settings", "ALTER TABLE athletes ADD COLUMN app_settings JSON"),
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
    from backend.app.api.metrics import router as metrics_router
    from backend.app.api.goals import router as goals_router
    from backend.app.api.strava import router as strava_router
    from backend.app.api.plans import router as plans_router

    app = FastAPI(title="openkoutsi API", version="1.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router, prefix="/api")
    app.include_router(athlete_router, prefix="/api")
    app.include_router(activities_router, prefix="/api")
    app.include_router(metrics_router, prefix="/api")
    app.include_router(goals_router, prefix="/api")
    app.include_router(strava_router, prefix="/api")
    app.include_router(plans_router, prefix="/api")

    return app


app = create_app()
