"""Add labels and notes columns to activities table.

Revision ID: 004_activity_labels_notes
Revises: 003_workout_category
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = "004_activity_labels_notes"
down_revision = "003_workout_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "activities",
        sa.Column("labels", sa.JSON(), nullable=True),
    )
    op.add_column(
        "activities",
        sa.Column("notes", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("activities", "notes")
    op.drop_column("activities", "labels")
