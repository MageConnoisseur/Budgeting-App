"""Add recurring_schedules for payday / monthly tracking reminders.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-12 20:25:00.000000

Additive migration — new table only; no changes to existing rows.

Note: originally landed with the same revision id as the savings
target_amount migration (b2c3d4e5f6a7). Re-id'd so Alembic can apply both
in sequence after that revision was already stamped in production.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "recurring_schedules",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("category_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("frequency", sa.String(length=16), nullable=False),
        sa.Column("anchor_day", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("next_occurrence", sa.Date(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_recurring_schedules_user_id"),
        "recurring_schedules",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_recurring_schedules_category_id"),
        "recurring_schedules",
        ["category_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_recurring_schedules_next_occurrence"),
        "recurring_schedules",
        ["next_occurrence"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_recurring_schedules_next_occurrence"),
        table_name="recurring_schedules",
    )
    op.drop_index(
        op.f("ix_recurring_schedules_category_id"),
        table_name="recurring_schedules",
    )
    op.drop_index(op.f("ix_recurring_schedules_user_id"), table_name="recurring_schedules")
    op.drop_table("recurring_schedules")
