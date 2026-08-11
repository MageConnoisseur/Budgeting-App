"""Run Alembic migrations safely for deploy.

If the schema already exists (e.g. created earlier) but alembic_version is
missing/empty, stamp head instead of recreating tables.
"""

from __future__ import annotations

import sys

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.config import get_settings

REVISION = "6f5d5bfda29a"


def main() -> int:
    settings = get_settings()
    engine = create_engine(settings.sqlalchemy_database_url)
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", settings.sqlalchemy_database_url)

    has_schema = "users" in tables
    current: str | None = None
    if "alembic_version" in tables:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT version_num FROM alembic_version")).first()
            current = row[0] if row else None

    if has_schema and current is None:
        print("Schema present without alembic_version; stamping head.")
        command.stamp(cfg, "head")
        return 0

    if current == REVISION or (has_schema and current == REVISION):
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
