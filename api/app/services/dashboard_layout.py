"""Default dashboard widgets and themed saved views.

New widget ids must be appended to DEFAULT_*_WIDGETS so GET-merge can add them
to existing saved layouts (hidden by default). Themed presets use stable
``setaside-*`` ids so every user — including those with a custom layout —
receives the three habit-change views without overwriting their current page.
"""

from __future__ import annotations

from app.enums import ViewMode
from app.schemas import DashboardLayoutPreset, DashboardWidget

SYSTEM_PREFIX = "setaside-"
USER_CURRENT_ID = "user-current"
USER_CURRENT_NAME = "My layout"

# Visible widget ids per themed view (order = reading/pack order).
MONTHLY_THIS_MONTH = [
    "allocation-snapshot",
    "budget-coach",
    "leftover-waterfall",
    "allocation-mix",
    "spending-runway",
    "largest-movers",
    "recurring-due",
    "category-breakdown",
    "spending-pace",
]
MONTHLY_FIX_THE_PLAN = [
    "month-compare",
    "underused-plan",
    "tradeoff",
    "flexible-split",
    "category-drilldown",
    "budget-coach",
    "category-breakdown",
    "income-progress",
    "expense-progress",
    "savings-progress",
]
MONTHLY_SAVINGS = [
    "savings-buckets",
    "savings-trajectory",
    "bucket-flow",
    "tradeoff",
    "true-leftover",
    "budget-coach",
    "savings-progress",
]
ANNUAL_THIS_YEAR = [
    "allocation-snapshot-year",
    "year-totals",
    "allocation-mix-year",
    "month-trends",
    "leftover-waterfall-year",
    "budget-coach-year",
    "largest-movers-year",
    "income-reliability",
]
ANNUAL_FIX_THE_PLAN = [
    "plan-heatmap",
    "underused-plan-year",
    "over-budget-patterns",
    "category-health",
    "plan-drift",
    "tradeoff-year",
    "category-drilldown-year",
    "budget-coach-year",
]
ANNUAL_SAVINGS = [
    "savings-buckets-year",
    "savings-trajectory-year",
    "bucket-flow-year",
    "tradeoff-year",
    "true-leftover-year",
    "budget-coach-year",
]


def _w(
    widget_id: str,
    widget_type: str,
    title: str,
    order: int,
    config: dict | None = None,
) -> DashboardWidget:
    return DashboardWidget(
        id=widget_id,
        type=widget_type,
        title=title,
        order=order,
        config=config or {},
    )


def _monthly_catalog() -> list[DashboardWidget]:
    """Full monthly catalog. Existing ids stay stable for saved-layout merge."""
    rows: list[DashboardWidget] = [
        _w("spending-pace", "spending_pace", "Spending pace", 0),
        _w("income-progress", "kind_progress", "Income", 1, {"kind": "income"}),
        _w("expense-progress", "kind_progress", "Expenses", 2, {"kind": "expense"}),
        _w("savings-progress", "kind_progress", "Savings", 3, {"kind": "savings"}),
        _w("cashflow-trend", "cashflow_trend", "Year cash-flow trend", 4),
        _w("savings-buckets", "savings_buckets", "Savings buckets", 5),
        _w("category-breakdown", "category_breakdown", "Categories", 6),
        _w("true-leftover", "true_leftover", "True leftover", 7),
        _w("budget-coach", "budget_coach", "Budget coach", 8),
        _w("allocation-snapshot", "allocation_snapshot", "This month at a glance", 9),
        _w("allocation-mix", "allocation_mix", "Planned vs actual mix", 10),
        _w("leftover-waterfall", "leftover_waterfall", "Leftover waterfall", 11),
        _w("spending-runway", "spending_runway", "Month runway", 12),
        _w("largest-movers", "largest_movers", "Largest movers", 13),
        _w("recurring-due", "recurring_due", "Recurring vs remaining", 14),
        _w("month-compare", "month_compare", "This month vs last", 15),
        _w("category-drilldown", "category_drilldown", "Category drill-down", 16),
        _w("underused-plan", "underused_plan", "Unused plan", 17),
        _w("flexible-split", "flexible_split", "Flexible vs committed", 18),
        _w("savings-trajectory", "savings_trajectory", "Savings trajectory", 19),
        _w("bucket-flow", "bucket_flow", "Bucket fill vs use", 20),
        _w("tradeoff", "tradeoff", "Reallocate leftover", 21),
    ]
    return rows


def _annual_catalog() -> list[DashboardWidget]:
    rows: list[DashboardWidget] = [
        _w("spending-pace-year", "spending_pace", "Spending pace", 0),
        _w("year-totals", "year_totals", "Year totals", 1),
        _w("month-trends", "month_trends", "Month-to-month trends", 2),
        _w("over-budget-patterns", "category_trends", "Repeated overruns", 3),
        _w("savings-buckets-year", "savings_buckets", "Savings buckets", 4),
        _w("category-health", "category_health", "Category health", 5),
        _w("true-leftover-year", "true_leftover", "True leftover", 6),
        _w("budget-coach-year", "budget_coach", "Budget coach", 7),
        _w("allocation-snapshot-year", "allocation_snapshot", "This year at a glance", 8),
        _w("allocation-mix-year", "allocation_mix", "Planned vs actual mix", 9),
        _w("leftover-waterfall-year", "leftover_waterfall", "Leftover waterfall", 10),
        _w("largest-movers-year", "largest_movers", "Largest movers", 11),
        _w("category-drilldown-year", "category_drilldown", "Category drill-down", 12),
        _w("underused-plan-year", "underused_plan", "Unused plan", 13),
        _w("flexible-split-year", "flexible_split", "Flexible vs committed", 14),
        _w("savings-trajectory-year", "savings_trajectory", "Savings trajectory", 15),
        _w("bucket-flow-year", "bucket_flow", "Bucket fill vs use", 16),
        _w("tradeoff-year", "tradeoff", "Reallocate leftover", 17),
        _w("plan-heatmap", "plan_heatmap", "Plan vs actual heatmap", 18),
        _w("plan-drift", "plan_drift", "Plan drift", 19),
        _w("income-reliability", "income_reliability", "Income reliability", 20),
    ]
    return rows


DEFAULT_MONTHLY_WIDGETS = _monthly_catalog()
DEFAULT_ANNUAL_WIDGETS = _annual_catalog()


def catalog_for(view_mode: ViewMode) -> list[DashboardWidget]:
    if view_mode == ViewMode.monthly:
        return [w.model_copy(deep=True) for w in DEFAULT_MONTHLY_WIDGETS]
    return [w.model_copy(deep=True) for w in DEFAULT_ANNUAL_WIDGETS]


def apply_visible(
    catalog: list[DashboardWidget], visible_ids: list[str]
) -> list[DashboardWidget]:
    by_id = {w.id: w for w in catalog}
    out: list[DashboardWidget] = []
    for i, widget_id in enumerate(visible_ids):
        widget = by_id.get(widget_id)
        if widget is None:
            continue
        cfg = {**widget.config, "hidden": False}
        out.append(widget.model_copy(update={"order": i, "config": cfg}))
    visible = set(visible_ids)
    for widget in catalog:
        if widget.id in visible:
            continue
        cfg = {**widget.config, "hidden": True}
        out.append(widget.model_copy(update={"order": len(out), "config": cfg}))
    return out


def default_presets(view_mode: ViewMode) -> list[DashboardLayoutPreset]:
    catalog = catalog_for(view_mode)
    if view_mode == ViewMode.monthly:
        return [
            DashboardLayoutPreset(
                id="setaside-this-month",
                name="This month",
                widgets=apply_visible(catalog, MONTHLY_THIS_MONTH),
            ),
            DashboardLayoutPreset(
                id="setaside-fix-the-plan",
                name="Fix the plan",
                widgets=apply_visible(catalog, MONTHLY_FIX_THE_PLAN),
            ),
            DashboardLayoutPreset(
                id="setaside-savings",
                name="Savings",
                widgets=apply_visible(catalog, MONTHLY_SAVINGS),
            ),
        ]
    return [
        DashboardLayoutPreset(
            id="setaside-this-year",
            name="This year",
            widgets=apply_visible(catalog, ANNUAL_THIS_YEAR),
        ),
        DashboardLayoutPreset(
            id="setaside-fix-the-plan-year",
            name="Fix the plan",
            widgets=apply_visible(catalog, ANNUAL_FIX_THE_PLAN),
        ),
        DashboardLayoutPreset(
            id="setaside-savings-year",
            name="Savings",
            widgets=apply_visible(catalog, ANNUAL_SAVINGS),
        ),
    ]


def merge_widgets(
    saved: list[DashboardWidget],
    incoming: list[DashboardWidget],
    *,
    hide_new: bool,
) -> list[DashboardWidget]:
    """Keep saved order/config; append widgets the user has never seen."""
    have = {w.id for w in saved}
    merged = list(saved)
    next_order = max((w.order for w in saved), default=-1) + 1
    for widget in incoming:
        if widget.id in have:
            continue
        cfg = dict(widget.config)
        if hide_new:
            cfg["hidden"] = True
        merged.append(widget.model_copy(update={"order": next_order, "config": cfg}))
        next_order += 1
    return merged


def is_system_preset(preset_id: str) -> bool:
    return preset_id.startswith(SYSTEM_PREFIX)


def seed_layout(
    saved_widgets: list[DashboardWidget] | None,
    saved_presets: list[DashboardLayoutPreset],
    active_id: str | None,
    view_mode: ViewMode,
) -> tuple[list[DashboardWidget], list[DashboardLayoutPreset], str | None]:
    """Return widgets + presets every user should see.

    * No saved row: themed defaults, active = first theme.
    * Saved layout, no presets: keep current widgets as "My layout", add themes.
    * Saved presets: append any missing system themes; merge new widget ids.
    """
    defaults = catalog_for(view_mode)
    themes = default_presets(view_mode)

    if saved_widgets is None:
        first = themes[0]
        return list(first.widgets), themes, first.id

    widgets = merge_widgets(saved_widgets, defaults, hide_new=True)
    presets = list(saved_presets)
    if not presets:
        presets.append(
            DashboardLayoutPreset(
                id=USER_CURRENT_ID,
                name=USER_CURRENT_NAME,
                widgets=widgets,
            )
        )
        if not active_id:
            active_id = USER_CURRENT_ID

    have = {p.id for p in presets}
    for theme in themes:
        if theme.id not in have:
            presets.append(theme)
            continue
        idx = next(i for i, p in enumerate(presets) if p.id == theme.id)
        current = presets[idx]
        incoming = theme.widgets if is_system_preset(theme.id) else defaults
        hide_new = not is_system_preset(theme.id)
        presets[idx] = current.model_copy(
            update={
                "widgets": merge_widgets(
                    current.widgets, incoming, hide_new=hide_new
                )
            }
        )

    if active_id:
        match = next((p for p in presets if p.id == active_id), None)
        if match is not None:
            widgets = list(match.widgets)
    widgets = merge_widgets(widgets, defaults, hide_new=True)
    return widgets, presets, active_id
