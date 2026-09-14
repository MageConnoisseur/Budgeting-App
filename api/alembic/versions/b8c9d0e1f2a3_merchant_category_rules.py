"""Merchant category memory for CSV import prefills.

Revision ID: b8c9d0e1f2a3
Revises: f6a7b8c9d0e1
Create Date: 2026-09-11 17:30:00.000000

One rule per user + normalized merchant key. Accept/merge upserts the last
chosen expense category so later inbox rows for that payee start there.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "merchant_rules",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("merchant_key", sa.String(length=128), nullable=False),
        sa.Column("category_id", sa.UUID(), nullable=False),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "merchant_key", name="uq_merchant_rules_user_merchant"
        ),
    )
    op.create_index(
        op.f("ix_merchant_rules_user_id"), "merchant_rules", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_merchant_rules_merchant_key"),
        "merchant_rules",
        ["merchant_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_merchant_rules_category_id"),
        "merchant_rules",
        ["category_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_merchant_rules_category_id"), table_name="merchant_rules")
    op.drop_index(op.f("ix_merchant_rules_merchant_key"), table_name="merchant_rules")
    op.drop_index(op.f("ix_merchant_rules_user_id"), table_name="merchant_rules")
    op.drop_table("merchant_rules")
