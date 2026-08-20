"""Themed dashboard views and widget-merge behavior."""

from __future__ import annotations

from app.enums import ViewMode
from app.schemas import DashboardLayoutPreset, DashboardWidget
from app.services.dashboard_layout import (
    MONTHLY_THIS_MONTH,
    USER_CURRENT_ID,
    seed_layout,
)


def test_new_layout_starts_on_this_month() -> None:
    widgets, presets, active = seed_layout(None, [], None, ViewMode.monthly)
    assert active == "setaside-this-month"
    assert [p.name for p in presets] == ["This month", "Fix the plan", "Savings"]
    visible = {w.id for w in widgets if w.config.get("hidden") is not True}
    assert visible == set(MONTHLY_THIS_MONTH)
    hidden = {w.id for w in widgets if w.config.get("hidden") is True}
    assert "expense-progress" in hidden
    assert "tradeoff" in hidden


def test_existing_layout_keeps_widgets_and_gains_themes() -> None:
    saved = [
        DashboardWidget(
            id="expense-progress",
            type="kind_progress",
            title="Expenses",
            order=0,
            config={"kind": "expense"},
        )
    ]
    widgets, presets, active = seed_layout(saved, [], None, ViewMode.monthly)
    assert active == USER_CURRENT_ID
    names = [p.name for p in presets]
    assert names[0] == "My layout"
    assert "This month" in names
    ids = {w.id for w in widgets}
    assert "expense-progress" in ids
    assert "allocation-snapshot" in ids
    snapshot = next(w for w in widgets if w.id == "allocation-snapshot")
    assert snapshot.config.get("hidden") is True


def test_custom_presets_keep_order_and_receive_system_views() -> None:
    overview = DashboardLayoutPreset(
        id="overview",
        name="Overview",
        widgets=[
            DashboardWidget(
                id="income-progress",
                type="kind_progress",
                title="Income",
                order=0,
                config={"kind": "income"},
            )
        ],
    )
    widgets, presets, active = seed_layout(
        overview.widgets, [overview], "overview", ViewMode.monthly
    )
    assert active == "overview"
    assert presets[0].name == "Overview"
    assert any(p.id == "setaside-this-month" for p in presets)
    assert any(w.id == "income-progress" for w in widgets)
