"""Pay expenses from a savings bucket (planned use) and pair tracker logs.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-18 17:55:00.000000

Expense budget lines may point at a savings category they are paid from.
That planned use is derived (not a negative contribution). Tracker rows that
log the bill and the bucket withdrawal share an optional pair_id.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "budget_lines",
        sa.Column("funded_by_category_id", sa.UUID(), nullable=True),
    )
    op.create_index(
        "ix_budget_lines_funded_by_category_id",
        "budget_lines",
        ["funded_by_category_id"],
    )
    op.create_foreign_key(
        "fk_budget_lines_funded_by_category_id",
        "budget_lines",
        "categories",
        ["funded_by_category_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "budget_template_lines",
        sa.Column("funded_by_category_id", sa.UUID(), nullable=True),
    )
    op.create_index(
        "ix_budget_template_lines_funded_by_category_id",
        "budget_template_lines",
        ["funded_by_category_id"],
    )
    op.create_foreign_key(
        "fk_budget_template_lines_funded_by_category_id",
        "budget_template_lines",
        "categories",
        ["funded_by_category_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("transactions", sa.Column("pair_id", sa.UUID(), nullable=True))
    op.create_index("ix_transactions_pair_id", "transactions", ["pair_id"])


def downgrade() -> None:
    op.drop_index("ix_transactions_pair_id", table_name="transactions")
    op.drop_column("transactions", "pair_id")

    op.drop_constraint(
        "fk_budget_template_lines_funded_by_category_id",
        "budget_template_lines",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_budget_template_lines_funded_by_category_id",
        table_name="budget_template_lines",
    )
    op.drop_column("budget_template_lines", "funded_by_category_id")

    op.drop_constraint(
        "fk_budget_lines_funded_by_category_id",
        "budget_lines",
        type_="foreignkey",
    )
    op.drop_index("ix_budget_lines_funded_by_category_id", table_name="budget_lines")
    op.drop_column("budget_lines", "funded_by_category_id")
