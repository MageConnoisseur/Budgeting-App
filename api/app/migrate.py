"""Run Alembic migrations safely for deploy.

Handles:

1. Empty database → ``alembic upgrade head``
2. Compatible schema already tracked by Alembic → ``upgrade head``
3. Compatible schema with a missing/wrong ``alembic_version`` row → stamp the
   revision the live schema actually matches, then upgrade (never stamp "head"
   blindly, which would skip later additive migrations)
4. Legacy ``database/tables.sql`` (BIGSERIAL ids, no preference columns):
   rebuild **only** when the database has no user rows, or when
   ``ALLOW_LEGACY_SCHEMA_REBUILD=true`` is set. Production data is never dropped
   as a surprise.

Registration 500s on Render were caused by case 4: migrate stamped head because
``users`` existed, but the ORM expects UUID ids + preferred_* columns.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Mapping
from dataclasses import dataclass

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from app.config import get_settings

# Drop order does not matter with CASCADE; listed for clarity.
APP_TABLES = (
    "recurring_schedules",
    "transactions",
    "budget_template_lines",
    "budget_lines",
    "dashboard_layouts",
    "budget_templates",
    "budget_months",
    "categories",
    "oauth_accounts",
    "users",
    "alembic_version",
)

# Oldest → newest fingerprints for the known linear chain. Unknown later
# revisions (added by other branches) are applied via ``upgrade head`` once
# this file has placed Alembic on the last matching known revision.
SCHEMA_FINGERPRINTS: tuple[tuple[str, str, str], ...] = (
    # revision, table, column that must exist for this revision to count as applied
    ("6f5d5bfda29a", "users", "preferred_budget_view"),
    ("a1b2c3d4e5f6", "oauth_accounts", "provider"),
    ("b2c3d4e5f6a7", "categories", "target_amount"),
    ("c3d4e5f6a7b8", "recurring_schedules", "next_occurrence"),
    ("d4e5f6a7b8c9", "budget_lines", "funded_by_category_id"),
)


@dataclass(frozen=True)
class SchemaSnapshot:
    tables: frozenset[str]
    columns: Mapping[str, frozenset[str]]
    users_id_type: str | None
    user_count: int
    alembic_version: str | None


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def database_url() -> str:
    """Prefer a direct (non-pooled) URL for DDL when operators set one."""
    direct = os.environ.get("DATABASE_URL_DIRECT", "").strip()
    if direct:
        return normalize_database_url(direct)
    return get_settings().sqlalchemy_database_url


def alembic_config(url: str) -> Config:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def alembic_head_revision(cfg: Config) -> str:
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    if len(heads) != 1:
        raise RuntimeError(
            f"Expected a single Alembic head, found {heads!r}. "
            "Resolve multiple heads before deploying."
        )
    return heads[0]


def revision_is_descendant(cfg: Config, descendant: str, ancestor: str) -> bool:
    """True if ``descendant`` is ``ancestor`` or walks down from it."""
    if descendant == ancestor:
        return True
    script = ScriptDirectory.from_config(cfg)
    try:
        walk = script.walk_revisions(base=ancestor, head=descendant)
        return any(rev.revision == descendant for rev in walk)
    except Exception:  # noqa: BLE001 — unknown / unreachable revisions
        return False


def users_schema_compatible(engine: Engine) -> bool:
    """Return True if users table matches the FastAPI ORM (UUID + preferences)."""
    return users_schema_compatible_snapshot(take_snapshot(engine))


def users_schema_compatible_snapshot(snap: SchemaSnapshot) -> bool:
    if "users" not in snap.tables:
        return True
    user_cols = snap.columns.get("users", frozenset())
    if "preferred_budget_view" not in user_cols:
        return False
    if "preferred_dashboard_view" not in user_cols:
        return False
    id_type = (snap.users_id_type or "").lower()
    return "uuid" in id_type


def infer_applied_revision(snap: SchemaSnapshot) -> str | None:
    """Return the newest known revision whose fingerprint is present.

    Stops at the first gap so a partially upgraded database is not treated as
    later than it really is.
    """
    if "users" not in snap.tables:
        return None
    applied: str | None = None
    for revision, table, column in SCHEMA_FINGERPRINTS:
        cols = snap.columns.get(table, frozenset())
        if table not in snap.tables or column not in cols:
            break
        applied = revision
    return applied


def rebuild_permitted(snap: SchemaSnapshot) -> bool:
    """Destructive rebuild is opt-in, or allowed only for unused leftover schemas."""
    if env_flag("ALLOW_LEGACY_SCHEMA_REBUILD"):
        return True
    return snap.user_count == 0


def take_snapshot(engine: Engine) -> SchemaSnapshot:
    insp = inspect(engine)
    tables = frozenset(insp.get_table_names())
    columns: dict[str, frozenset[str]] = {}
    for table in tables:
        columns[table] = frozenset(c["name"] for c in insp.get_columns(table))

    users_id_type: str | None = None
    if "users" in tables:
        for col in insp.get_columns("users"):
            if col["name"] == "id":
                users_id_type = str(col["type"])
                break

    user_count = 0
    if "users" in tables:
        with engine.connect() as conn:
            user_count = int(conn.execute(text("SELECT COUNT(*) FROM users")).scalar_one())

    current: str | None = None
    if "alembic_version" in tables:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT version_num FROM alembic_version")).first()
            current = row[0] if row else None

    return SchemaSnapshot(
        tables=tables,
        columns=columns,
        users_id_type=users_id_type,
        user_count=user_count,
        alembic_version=current,
    )


def drop_app_schema(engine: Engine) -> None:
    with engine.begin() as conn:
        for table in APP_TABLES:
            conn.execute(text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))
        conn.execute(text("DROP TYPE IF EXISTS category_kind CASCADE"))


def _incompatible_message(snap: SchemaSnapshot) -> str:
    return (
        "Incompatible schema detected (expected UUID users.id + preferred_* "
        f"columns; users.id type={snap.users_id_type!r}, user_count={snap.user_count}). "
        "Refusing to drop production tables. Fix the schema with a forward "
        "Alembic revision, or set ALLOW_LEGACY_SCHEMA_REBUILD=true only for "
        "empty leftover databases from the old database/tables.sql apply path."
    )


def main() -> int:
    url = database_url()
    engine = create_engine(url)
    cfg = alembic_config(url)
    head = alembic_head_revision(cfg)
    snap = take_snapshot(engine)

    if "users" not in snap.tables:
        print(f"Empty database; upgrading to {head}…")
        command.upgrade(cfg, "head")
        return 0

    if not users_schema_compatible_snapshot(snap):
        if rebuild_permitted(snap):
            print(
                "Incompatible leftover schema with no user data "
                "(or ALLOW_LEGACY_SCHEMA_REBUILD=true). "
                "Dropping app tables and recreating via Alembic."
            )
            drop_app_schema(engine)
            command.upgrade(cfg, "head")
            return 0
        print(_incompatible_message(snap), file=sys.stderr)
        return 1

    inferred = infer_applied_revision(snap)
    current = snap.alembic_version

    if current is None:
        stamp_to = inferred or SCHEMA_FINGERPRINTS[0][0]
        print(
            f"Compatible schema present without alembic_version; "
            f"stamping {stamp_to} (not head) then upgrading to {head}."
        )
        command.stamp(cfg, stamp_to)
        command.upgrade(cfg, "head")
        return 0

    if inferred and current != inferred:
        known_ids = {rev for rev, _table, _col in SCHEMA_FINGERPRINTS}
        if current in known_ids and not revision_is_descendant(cfg, inferred, current):
            # Version row is ahead of the live schema (classic false "already at
            # head" stamp). Move the pointer back to what is actually applied.
            print(
                f"alembic_version={current} is ahead of live schema "
                f"(inferred {inferred}); restamping then upgrading to {head}."
            )
            command.stamp(cfg, inferred)
            command.upgrade(cfg, "head")
            return 0
        if current not in known_ids and revision_is_descendant(cfg, current, inferred):
            # A newer revision from another branch is recorded; schema
            # fingerprints only go to the last known marker. Trust Alembic.
            print(f"Upgrading from {current} to {head}…")
            command.upgrade(cfg, "head")
            return 0
        if inferred != current and revision_is_descendant(cfg, inferred, current):
            print(
                f"Live schema ({inferred}) is ahead of alembic_version={current}; "
                f"stamping {inferred} then upgrading to {head}."
            )
            command.stamp(cfg, inferred)
            command.upgrade(cfg, "head")
            return 0

    if current == head:
        print(f"Already at {current}; nothing to do.")
        return 0

    print(f"Upgrading from {current!r} to {head}…")
    command.upgrade(cfg, "head")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 — surface clear deploy logs
        print(f"Migration failed: {exc}", file=sys.stderr)
        raise
