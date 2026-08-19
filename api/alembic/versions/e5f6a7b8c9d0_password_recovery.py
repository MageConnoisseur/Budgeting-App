"""Password recovery tokens and email verification timestamp.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-19 15:00:00.000000

Supports forgot-password / set-password recovery emails and clearer
Account messaging when an address is missing or unconfirmed.
Email verification is still not required to sign in.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "recovery_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_recovery_tokens_token_hash"),
    )
    op.create_index(
        op.f("ix_recovery_tokens_user_id"), "recovery_tokens", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_recovery_tokens_purpose"), "recovery_tokens", ["purpose"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_recovery_tokens_purpose"), table_name="recovery_tokens")
    op.drop_index(op.f("ix_recovery_tokens_user_id"), table_name="recovery_tokens")
    op.drop_table("recovery_tokens")
    op.drop_column("users", "email_verified_at")
