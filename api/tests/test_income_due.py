"""Income under-plan is only 'overrun' after paydays / the month are due."""

from datetime import date

from app.services.dashboard import income_shortfall_is_due


def test_future_month_never_due() -> None:
    assert (
        income_shortfall_is_due(
            month_start=date(2026, 10, 1),
            month_end=date(2026, 10, 31),
            today=date(2026, 8, 13),
            payday_dates=[date(2026, 10, 1), date(2026, 10, 15)],
        )
        is False
    )


def test_past_month_always_due_even_without_schedule() -> None:
    assert (
        income_shortfall_is_due(
            month_start=date(2026, 5, 1),
            month_end=date(2026, 5, 31),
            today=date(2026, 8, 13),
            payday_dates=[],
        )
        is True
    )


def test_current_month_without_schedule_waits_for_month_end() -> None:
    assert (
        income_shortfall_is_due(
            month_start=date(2026, 8, 1),
            month_end=date(2026, 8, 31),
            today=date(2026, 8, 13),
            payday_dates=[],
        )
        is False
    )


def test_current_month_still_waiting_on_later_payday() -> None:
    assert (
        income_shortfall_is_due(
            month_start=date(2026, 8, 1),
            month_end=date(2026, 8, 31),
            today=date(2026, 8, 13),
            payday_dates=[date(2026, 8, 1), date(2026, 8, 15)],
        )
        is False
    )


def test_current_month_due_after_last_payday() -> None:
    assert (
        income_shortfall_is_due(
            month_start=date(2026, 8, 1),
            month_end=date(2026, 8, 31),
            today=date(2026, 8, 16),
            payday_dates=[date(2026, 8, 1), date(2026, 8, 15)],
        )
        is True
    )


def test_payday_day_itself_is_not_yet_due() -> None:
    assert (
        income_shortfall_is_due(
            month_start=date(2026, 8, 1),
            month_end=date(2026, 8, 31),
            today=date(2026, 8, 15),
            payday_dates=[date(2026, 8, 15)],
        )
        is False
    )
