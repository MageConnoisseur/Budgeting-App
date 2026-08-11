-- Budgeting app schema (source of truth for table definitions).
-- Apply with: python database/apply_tables.py
-- When changing the database, update this file and re-run the apply script.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'category_kind') THEN
    CREATE TYPE category_kind AS ENUM ('income', 'expense', 'savings');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       category_kind NOT NULL,
  name       TEXT NOT NULL,
  archived   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind, name)
);

CREATE TABLE IF NOT EXISTS budget_months (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  year       INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month      INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, year, month)
);

CREATE TABLE IF NOT EXISTS budget_lines (
  id              BIGSERIAL PRIMARY KEY,
  budget_month_id BIGINT NOT NULL REFERENCES budget_months (id) ON DELETE CASCADE,
  category_id     BIGINT NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  planned_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (budget_month_id, category_id)
);

CREATE TABLE IF NOT EXISTS budget_templates (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS budget_template_lines (
  id                 BIGSERIAL PRIMARY KEY,
  budget_template_id BIGINT NOT NULL REFERENCES budget_templates (id) ON DELETE CASCADE,
  category_id        BIGINT NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  planned_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (budget_template_id, category_id)
);

-- Amounts are always stored as positive values.
-- Direction (in vs out) comes from categories.kind.
CREATE TABLE IF NOT EXISTS transactions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  occurred_on DATE NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_user_kind
  ON categories (user_id, kind);

CREATE INDEX IF NOT EXISTS idx_categories_user_sort
  ON categories (user_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_budget_months_user_period
  ON budget_months (user_id, year DESC, month DESC);

CREATE INDEX IF NOT EXISTS idx_budget_lines_month
  ON budget_lines (budget_month_id);

CREATE INDEX IF NOT EXISTS idx_budget_lines_category
  ON budget_lines (category_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions (user_id, occurred_on DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_category
  ON transactions (user_id, category_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user_amount
  ON transactions (user_id, amount);
