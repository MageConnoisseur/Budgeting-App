"""Run Alembic migrations safely for deploy.

Handles three cases:
1. Empty database → alembic upgrade head
2. Compatible schema already at head → no-op (or stamp if version row missing)
3. Legacy schema from early `database/tables.sql` (BIGSERIAL ids, no preference
   columns) that was wrongly stamped as head → drop and recreate

Registration 500s on Render were caused by case 3: migrate stamped head because
`users` existed, but the ORM expects UUID ids + preferred_* columns.
"""

from __future__ import annotations

import sys

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from app.config import get_settings

REVISION = "a1b2c3d4e5f6"

# Drop order does not matter with CASCADE; listed for clarity.
APP_TABLES = (
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


def users_schema_compatible(engine: Engine) -> bool:
    """Return True if users table matches the FastAPI ORM (UUID + preferences)."""
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return True

    cols = {c["name"]: c for c in insp.get_columns("users")}
    if "preferred_budget_view" not in cols or "preferred_dashboard_view" not in cols:
        return False

    id_type = str(cols["id"]["type"]).lower()
    # Neon/Postgres report UUID(); legacy tables.sql used BIGSERIAL/BIGINT.
    if "uuid" not in id_type:
        return False
    return True


def drop_app_schema(engine: Engine) -> None:
    with engine.begin() as conn:
        for table in APP_TABLES:
            conn.execute(text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))
        conn.execute(text("DROP TYPE IF EXISTS category_kind CASCADE"))


def main() -> int:
    settings = get_settings()
    engine = create_engine(settings.sqlalchemy_database_url)
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", settings.sqlalchemy_database_url)

    current: str | None = None
    if "alembic_version" in tables:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT version_num FROM alembic_version")).first()
            current = row[0] if row else None

    compatible = users_schema_compatible(engine)

    if "users" in tables and not compatible:
        print(
            "Incompatible legacy schema detected "
            "(expected UUID users.id + preferred_* columns). "
            "Dropping app tables and recreating via Alembic."
        )
        drop_app_schema(engine)
        command.upgrade(cfg, "head")
        return 0

    if "users" in tables and current is None and compatible:
        print("Compatible schema present without alembic_version; stamping head.")
        command.stamp(cfg, "head")
        return 0

    if current == REVISION and compatible:
        print(f"Already at {current}; nothing to do.")
        return 0

    print(f"Upgrading from {current!r} to head…")
    command.upgrade(cfg, "head")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 — surface clear deploy logs
        print(f"Migration failed: {exc}", file=sys.stderr)
        raise
