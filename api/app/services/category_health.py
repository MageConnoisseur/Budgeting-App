"""Category health scores: plan-vs-actual consistency over ~6 months.

Turns annual overrun counts into actionable labels:
- stable — actuals track the plan closely
- volatile — month-to-month swings in how actual compares to plan
- under_planned — chronically over plan (plan too low)
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from math import sqrt
from typing import Literal
from uuid import UUID

from app.enums import CategoryKind
from app.schemas import CategoryHealthScore

ZERO = Decimal("0.00")
MONEY = Decimal("0.01")

HEALTH_LOOKBACK_MONTHS = 6
HEALTH_MIN_MONTHS = 3
# Coefficient of variation of actual/planned ratios.
STABLE_MAX_CV = 0.18
VOLATILE_MIN_CV = 0.28
# Chronically under-planned thresholds.
UNDER_PLANNED_MIN_OVER = 3
UNDER_PLANNED_MIN_RATE = 0.5
UNDER_PLANNED_MIN_MEAN_RATIO = Decimal("1.15")

CategoryHealthStatus = Literal["stable", "volatile", "under_planned"]


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _population_stdev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mu = _mean(values)
    return sqrt(sum((v - mu) ** 2 for v in values) / len(values))


def _lookback_months(year: int, as_of: date) -> list[int]:
    """Up to the last HEALTH_LOOKBACK_MONTHS calendar months in `year` ending at as_of."""
    if year < as_of.year:
        end_month = 12
    elif year > as_of.year:
        return []
    else:
        end_month = as_of.month
    start = max(1, end_month - HEALTH_LOOKBACK_MONTHS + 1)
    return list(range(start, end_month + 1))


def _classify(
    *,
    months_scored: int,
    months_over: int,
    cv: float,
    mean_ratio: Decimal,
) -> CategoryHealthStatus:
    over_rate = months_over / months_scored if months_scored else 0.0
    chronically = months_over >= UNDER_PLANNED_MIN_OVER and (
        over_rate >= UNDER_PLANNED_MIN_RATE
        or mean_ratio >= UNDER_PLANNED_MIN_MEAN_RATIO
    )
    if chronically:
        return "under_planned"
    if cv >= VOLATILE_MIN_CV:
        return "volatile"
    if cv <= STABLE_MAX_CV and over_rate <= 0.34:
        return "stable"
    # Mixed: some overrun or moderate swing — treat as volatile so it stays actionable.
    if months_over >= 2 or cv > STABLE_MAX_CV:
        return "volatile"
    return "stable"


def _message(status: CategoryHealthStatus, months_over: int, months_scored: int) -> str:
    if status == "under_planned":
        return (
            f"Chronically under-planned — over in {months_over} of "
            f"{months_scored} months. Consider raising the plan."
        )
    if status == "volatile":
        return (
            "Volatile vs plan — actuals swing month to month. "
            "A buffer or seasonal plans may help."
        )
    return (
        f"Stable — actuals stayed close to plan over {months_scored} months."
    )


def build_category_health_scores(
    year: int,
    category_accum: dict[UUID, dict],
    *,
    today: date | None = None,
) -> list[CategoryHealthScore]:
    """Score expense/savings categories from annual month samples."""
    as_of = today or date.today()
    window = set(_lookback_months(year, as_of))
    if not window:
        return []

    scores: list[CategoryHealthScore] = []
    for cid, data in category_accum.items():
        kind: CategoryKind = data["kind"]
        if kind not in (CategoryKind.expense, CategoryKind.savings):
            continue

        samples: list[dict] = data.get("samples") or []
        scored = [
            s
            for s in samples
            if s["month"] in window and s["planned"] > ZERO
        ]
        if len(scored) < HEALTH_MIN_MONTHS:
            continue

        ratios: list[float] = []
        months_over = 0
        for s in scored:
            planned = s["planned"]
            actual = s["actual"]
            ratio = float(actual / planned) if planned > ZERO else 0.0
            ratios.append(ratio)
            if s.get("over") or (actual > planned and planned > ZERO):
                months_over += 1

        mean_ratio_f = _mean(ratios)
        stdev = _population_stdev(ratios)
        cv = (stdev / mean_ratio_f) if mean_ratio_f > 0 else 0.0
        mean_ratio = _money(Decimal(str(round(mean_ratio_f, 4))))
        status = _classify(
            months_scored=len(scored),
            months_over=months_over,
            cv=cv,
            mean_ratio=mean_ratio,
        )

        scores.append(
            CategoryHealthScore(
                category_id=cid,
                category_name=data["name"],
                kind=kind,
                status=status,
                months_scored=len(scored),
                months_over_budget=months_over,
                mean_ratio=mean_ratio,
                volatility=round(cv, 4),
                lookback_months=HEALTH_LOOKBACK_MONTHS,
                message=_message(status, months_over, len(scored)),
            )
        )

    status_rank = {"under_planned": 0, "volatile": 1, "stable": 2}
    scores.sort(
        key=lambda s: (
            status_rank.get(s.status, 9),
            -s.months_over_budget,
            -s.volatility,
            s.category_name,
        )
    )
    return scores
