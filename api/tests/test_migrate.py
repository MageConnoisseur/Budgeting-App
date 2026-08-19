"""Unit tests for safe Alembic deploy helpers (no live schema required)."""

from __future__ import annotations

from app.migrate import (
    SCHEMA_FINGERPRINTS,
    SchemaSnapshot,
    infer_applied_revision,
    rebuild_permitted,
    users_schema_compatible_snapshot,
)


def _snap(
    *,
    tables: set[str] | None = None,
    columns: dict[str, set[str]] | None = None,
    users_id_type: str | None = "UUID",
    user_count: int = 0,
    alembic_version: str | None = None,
) -> SchemaSnapshot:
    col_map = {name: frozenset(cols) for name, cols in (columns or {}).items()}
    return SchemaSnapshot(
        tables=frozenset(tables or ()),
        columns=col_map,
        users_id_type=users_id_type,
        user_count=user_count,
        alembic_version=alembic_version,
    )


def test_empty_schema_is_compatible() -> None:
    assert users_schema_compatible_snapshot(_snap()) is True
    assert infer_applied_revision(_snap()) is None


def test_legacy_bigint_users_rejected() -> None:
    snap = _snap(
        tables={"users"},
        columns={"users": {"id", "username", "password_hash"}},
        users_id_type="BIGINT",
        user_count=3,
    )
    assert users_schema_compatible_snapshot(snap) is False
    assert rebuild_permitted(snap) is False


def test_empty_legacy_schema_may_rebuild() -> None:
    snap = _snap(
        tables={"users"},
        columns={"users": {"id", "username", "password_hash"}},
        users_id_type="BIGINT",
        user_count=0,
    )
    assert rebuild_permitted(snap) is True


def test_rebuild_flag_allows_populated_legacy(monkeypatch) -> None:
    snap = _snap(
        tables={"users"},
        columns={"users": {"id", "username"}},
        users_id_type="BIGINT",
        user_count=12,
    )
    monkeypatch.setenv("ALLOW_LEGACY_SCHEMA_REBUILD", "true")
    assert rebuild_permitted(snap) is True
    monkeypatch.delenv("ALLOW_LEGACY_SCHEMA_REBUILD", raising=False)
    assert rebuild_permitted(snap) is False


def test_uuid_prefs_count_as_initial_revision() -> None:
    snap = _snap(
        tables={"users", "categories", "budget_lines"},
        columns={
            "users": {
                "id",
                "username",
                "preferred_budget_view",
                "preferred_dashboard_view",
            },
            "categories": {"id", "name", "kind"},
            "budget_lines": {"id", "planned_amount"},
        },
    )
    assert users_schema_compatible_snapshot(snap) is True
    assert infer_applied_revision(snap) == "6f5d5bfda29a"


def test_fingerprint_stops_at_first_gap() -> None:
    snap = _snap(
        tables={"users", "oauth_accounts", "budget_lines"},
        columns={
            "users": {
                "id",
                "email",
                "preferred_budget_view",
                "preferred_dashboard_view",
            },
            "oauth_accounts": {"id", "provider"},
            "budget_lines": {"id", "funded_by_category_id"},
        },
    )
    # target_amount / recurring_schedules missing → do not skip ahead to funded_by
    assert infer_applied_revision(snap) == "a1b2c3d4e5f6"


def test_full_known_chain_infers_latest_fingerprint() -> None:
    snap = _snap(
        tables={
            "users",
            "oauth_accounts",
            "categories",
            "recurring_schedules",
            "budget_lines",
            "recovery_tokens",
        },
        columns={
            "users": {
                "id",
                "preferred_budget_view",
                "preferred_dashboard_view",
            },
            "oauth_accounts": {"provider"},
            "categories": {"target_amount"},
            "recurring_schedules": {"next_occurrence"},
            "budget_lines": {"funded_by_category_id"},
            "recovery_tokens": {"token_hash"},
        },
    )
    assert infer_applied_revision(snap) == SCHEMA_FINGERPRINTS[-1][0]
