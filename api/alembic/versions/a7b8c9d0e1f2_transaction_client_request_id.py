"""Phone outbox id on transactions so a background retry is not a second log.

Revision ID: a7b8c9d0e1f2
Revises: c0d1e2f3a4b5
Create Date: 2026-11-06 14:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "c0d1e2f3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("client_request_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "uq_transactions_user_client_request",
        "transactions",
        ["user_id", "client_request_id"],
        unique=True,
        postgresql_where=sa.text("client_request_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_transactions_user_client_request", table_name="transactions")
    op.drop_column("transactions", "client_request_id")
