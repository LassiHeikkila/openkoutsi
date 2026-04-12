from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from backend.app.core.config import settings


class Base(DeclarativeBase):
    pass


def _set_wal_mode(dbapi_conn, _connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


engine = create_async_engine(
    f"sqlite+aiosqlite:///{settings.database_path}",
    echo=False,
)

from sqlalchemy import event  # noqa: E402

event.listen(engine.sync_engine, "connect", _set_wal_mode)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
