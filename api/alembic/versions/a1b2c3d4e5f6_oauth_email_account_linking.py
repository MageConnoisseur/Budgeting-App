"""Add email + oauth_accounts for social login and account linking.

Revision ID: a1b2c3d4e5f6
Revises: 6f5d5bfda29a
Create Date: 2026-08-12 17:40:00.000000

Additive migration — existing users keep their data:
- email is nullable (existing rows stay NULL until set)
- password_hash becomes nullable for OAuth-only accounts (existing hashes preserved)
- oauth_accounts is a new table for provider links
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "6f5d5bfda29a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(length=320), nullable=True))
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=True,
    )

    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_subject", sa.String(length=255), nullable=False),
        sa.Column("provider_email", sa.String(length=320), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider", "provider_subject", name="uq_oauth_accounts_provider_subject"
        ),
        sa.UniqueConstraint(
            "user_id", "provider", name="uq_oauth_accounts_user_provider"
        ),
    )
    op.create_index(
        op.f("ix_oauth_accounts_user_id"), "oauth_accounts", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_oauth_accounts_provider"),
        "oauth_accounts",
        ["provider"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_oauth_accounts_provider"), table_name="oauth_accounts")
    op.drop_index(op.f("ix_oauth_accounts_user_id"), table_name="oauth_accounts")
    op.drop_table("oauth_accounts")
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_column("users", "email")
