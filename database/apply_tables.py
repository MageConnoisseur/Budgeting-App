#!/usr/bin/env python3
"""Apply database/tables.sql to the configured Postgres database.

Usage:
  python database/apply_tables.py
  python database/apply_tables.py --reset   # drop app tables/types, then recreate

Requires DATABASE_URL or DATABASE_URL_DIRECT in the environment or a .env file
at the repo root. Prefers DATABASE_URL_DIRECT for schema changes.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    import psycopg
except ImportError:
    print("Missing dependency: psycopg. Install with: pip install 'psycopg[binary]'", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
TABLES_FILE = Path(__file__).resolve().parent / "tables.sql"
ENV_FILE = ROOT / ".env"

DROP_SQL = """
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS budget_template_lines CASCADE;
DROP TABLE IF EXISTS budget_templates CASCADE;
DROP TABLE IF EXISTS budget_lines CASCADE;
DROP TABLE IF EXISTS budget_months CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS category_kind CASCADE;
"""


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key, value)


def database_url() -> str:
    url = os.environ.get("DATABASE_URL_DIRECT") or os.environ.get("DATABASE_URL")
    if not url:
        print(
            "No DATABASE_URL or DATABASE_URL_DIRECT found. "
            "Add one to .env or export it in your shell.",
            file=sys.stderr,
        )
        sys.exit(1)
    return url


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply database/tables.sql")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop existing app tables/types before applying tables.sql",
    )
    args = parser.parse_args()

    load_dotenv(ENV_FILE)

    if not TABLES_FILE.exists():
        print(f"Tables file not found: {TABLES_FILE}", file=sys.stderr)
        return 1

    sql = TABLES_FILE.read_text()
    url = database_url()

    with psycopg.connect(url) as conn:
        conn.execute("SELECT 1")
        with conn.transaction():
            if args.reset:
                conn.execute(DROP_SQL)
                print("Dropped existing app tables and types.")
            conn.execute(sql)
        print(f"Applied {TABLES_FILE.relative_to(ROOT)}")

        rows = conn.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """
        ).fetchall()

    print("Tables in public schema:")
    for (name,) in rows:
        print(f"  - {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
