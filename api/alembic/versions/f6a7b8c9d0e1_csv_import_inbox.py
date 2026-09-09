"""CSV import inbox: batches, staging candidates, ledger fingerprints.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-09 12:00:00.000000

Staging inbox for Discover (and later other bank) CSV imports. Candidates
are not tracker rows until the user accepts or merges them.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("import_fingerprint", sa.String(length=64), nullable=True),
    )
    op.create_index(
        op.f("ix_transactions_import_fingerprint"),
        "transactions",
        ["import_fingerprint"],
        unique=False,
    )
    op.create_index(
        "uq_transactions_user_import_fingerprint",
        "transactions",
        ["user_id", "import_fingerprint"],
        unique=True,
        postgresql_where=sa.text("import_fingerprint IS NOT NULL"),
    )

    op.create_table(
        "import_batches",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=False),
        sa.Column("date_to", sa.Date(), nullable=False),
        sa.Column("imported_count", sa.Integer(), nullable=False),
        sa.Column("skipped_payment_count", sa.Integer(), nullable=False),
        sa.Column("skipped_duplicate_count", sa.Integer(), nullable=False),
        sa.Column("skipped_out_of_range_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_import_batches_user_id"), "import_batches", ["user_id"], unique=False
    )

    op.create_table(
        "import_candidates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("batch_id", sa.UUID(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("trans_date", sa.Date(), nullable=False),
        sa.Column("post_date", sa.Date(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=False),
        sa.Column("merchant_key", sa.String(length=128), nullable=False),
        sa.Column("issuer_category", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("category_id", sa.UUID(), nullable=True),
        sa.Column("matched_transaction_id", sa.UUID(), nullable=True),
        sa.Column("match_kind", sa.String(length=16), nullable=False),
        sa.Column("accepted_transaction_id", sa.UUID(), nullable=True),
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
        sa.ForeignKeyConstraint(["batch_id"], ["import_batches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["matched_transaction_id"], ["transactions.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["accepted_transaction_id"], ["transactions.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "fingerprint", name="uq_import_candidates_user_fingerprint"
        ),
    )
    op.create_index(
        op.f("ix_import_candidates_user_id"),
        "import_candidates",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_import_candidates_batch_id"),
        "import_candidates",
        ["batch_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_import_candidates_fingerprint"),
        "import_candidates",
        ["fingerprint"],
        unique=False,
    )
    op.create_index(
        op.f("ix_import_candidates_trans_date"),
        "import_candidates",
        ["trans_date"],
        unique=False,
    )
    op.create_index(
        op.f("ix_import_candidates_merchant_key"),
        "import_candidates",
        ["merchant_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_import_candidates_status"),
        "import_candidates",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_import_candidates_category_id"),
        "import_candidates",
        ["category_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_import_candidates_matched_transaction_id"),
        "import_candidates",
        ["matched_transaction_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_import_candidates_matched_transaction_id"),
        table_name="import_candidates",
    )
    op.drop_index(op.f("ix_import_candidates_category_id"), table_name="import_candidates")
    op.drop_index(op.f("ix_import_candidates_status"), table_name="import_candidates")
    op.drop_index(
        op.f("ix_import_candidates_merchant_key"), table_name="import_candidates"
    )
    op.drop_index(op.f("ix_import_candidates_trans_date"), table_name="import_candidates")
    op.drop_index(op.f("ix_import_candidates_fingerprint"), table_name="import_candidates")
    op.drop_index(op.f("ix_import_candidates_batch_id"), table_name="import_candidates")
    op.drop_index(op.f("ix_import_candidates_user_id"), table_name="import_candidates")
    op.drop_table("import_candidates")
    op.drop_index(op.f("ix_import_batches_user_id"), table_name="import_batches")
    op.drop_table("import_batches")
    op.drop_index(
        "uq_transactions_user_import_fingerprint", table_name="transactions"
    )
    op.drop_index(op.f("ix_transactions_import_fingerprint"), table_name="transactions")
    op.drop_column("transactions", "import_fingerprint")
