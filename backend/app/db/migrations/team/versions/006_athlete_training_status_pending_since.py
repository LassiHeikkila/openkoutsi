"""Add training_status_pending_since column to athletes table.

Revision ID: 006_athlete_training_status_pending_since
Revises: 005_planned_workout_skip_reason
Create Date: 2026-06-06

Idempotent: safe to run against DBs that already have this column.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "006_athlete_training_status_pending_since"
down_revision = "005_planned_workout_skip_reason"
branch_labels = None
depends_on = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    rows = conn.execute(text(f'PRAGMA table_info("{table_name}")')).fetchall()
    return any(row[1] == column_name for row in rows)


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "athletes", "training_status_pending_since"):
        op.add_column(
            "athletes",
            sa.Column("training_status_pending_since", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "athletes", "training_status_pending_since"):
        op.drop_column("athletes", "training_status_pending_since")
