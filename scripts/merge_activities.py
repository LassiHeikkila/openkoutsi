"""
Merge two Activity records into one, keeping the higher-priority source's data.

Usage:
    uv run python scripts/merge_activities.py <team_id> <keep_id> <drop_id>

The activity identified by <keep_id> is preserved with all its existing metrics
and streams. The ActivitySources from <drop_id> are moved over to <keep_id>
(skipping any provider that already has a source on <keep_id>). <drop_id> and
all its associated data are then deleted.

Run recalculate afterwards to fix any daily metric double-counting:
    uv run python scripts/merge_activities.py <team_id> <keep_id> <drop_id>
"""

import asyncio
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import delete, select, update

from backend.app.db.team_session import get_team_session_factory
from backend.app.models.team_orm import (
    Activity,
    ActivityDistanceBest,
    ActivityInterval,
    ActivityPowerBest,
    ActivitySource,
    ActivityStream,
)
from backend.app.services.metrics_engine import recalculate_from


async def merge(team_id: str, keep_id: str, drop_id: str) -> None:
    async with get_team_session_factory(team_id)() as session:
        keep_result = await session.execute(select(Activity).where(Activity.id == keep_id))
        keep = keep_result.scalar_one_or_none()
        if keep is None:
            print(f"ERROR: keep activity {keep_id} not found in team {team_id}")
            sys.exit(1)

        drop_result = await session.execute(select(Activity).where(Activity.id == drop_id))
        drop = drop_result.scalar_one_or_none()
        if drop is None:
            print(f"ERROR: drop activity {drop_id} not found in team {team_id}")
            sys.exit(1)

        if keep.athlete_id != drop.athlete_id:
            print("ERROR: activities belong to different athletes")
            sys.exit(1)

        print(f"Keep : {keep.id}  {keep.start_time}  sources={[s.provider for s in keep.sources]}")
        print(f"Drop : {drop.id}  {drop.start_time}  sources={[s.provider for s in drop.sources]}")

        keep_providers = {s.provider for s in keep.sources}

        # Move sources from drop to keep, skipping provider conflicts
        drop_sources = list(drop.sources)
        for src in drop_sources:
            if src.provider in keep_providers:
                print(f"  Skip source '{src.provider}' — keep already has one")
            else:
                print(f"  Moving source '{src.provider}' ({src.external_id}) to keep")
                src.activity_id = keep.id
                keep_providers.add(src.provider)
        await session.flush()

        # Delete all data attached to drop
        for model in (ActivityStream, ActivityPowerBest, ActivityDistanceBest, ActivityInterval):
            await session.execute(delete(model).where(model.activity_id == drop_id))
        await session.flush()

        # Any sources that couldn't move still point at drop — delete them
        await session.execute(
            delete(ActivitySource).where(ActivitySource.activity_id == drop_id)
        )
        await session.flush()

        await session.delete(drop)
        await session.flush()

        start_date: date = (
            keep.start_time.date()
            if keep.start_time and hasattr(keep.start_time, "date")
            else date.today()
        )

        await session.commit()
        print("Merge committed. Recalculating daily metrics...")
        await recalculate_from(keep.athlete_id, start_date, session)
        print("Done.")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)

    _, team_id, keep_id, drop_id = sys.argv
    asyncio.run(merge(team_id, keep_id, drop_id))
