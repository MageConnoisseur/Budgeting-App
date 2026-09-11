"""Map Discover (issuer) category labels onto the user's expense names."""

from __future__ import annotations

import re
from uuid import UUID

_TOKEN = re.compile(r"[a-z0-9]+")

# Shared meaning so a bank label can prefill a similarly named Setaside category.
# Keep this tight: "Merchandise" and "Services" are too broad to guess.
_GROUPS = (
    frozenset({"grocery", "groceries", "supermarket", "supermarkets", "grocer"}),
    frozenset({"gas", "fuel", "gasoline", "petrol"}),
    frozenset({"dining", "restaurant", "restaurants"}),
)


def _tokens(text: str) -> set[str]:
    return set(_TOKEN.findall((text or "").lower()))


def _group_for(tokens: set[str]) -> frozenset[str] | None:
    for group in _GROUPS:
        if tokens & group:
            return group
    return None


def issuer_label_matches_category(issuer_category: str, category_name: str) -> bool:
    issuer_tokens = _tokens(issuer_category)
    name_tokens = _tokens(category_name)
    if not issuer_tokens or not name_tokens:
        return False
    if issuer_tokens & name_tokens:
        return True
    issuer_group = _group_for(issuer_tokens)
    name_group = _group_for(name_tokens)
    return issuer_group is not None and issuer_group is name_group


def best_category_for_issuer_label(
    issuer_category: str | None,
    categories: list[tuple[UUID, str]],
) -> UUID | None:
    label = (issuer_category or "").strip()
    if not label or not categories:
        return None
    matches = [
        (cid, name)
        for cid, name in categories
        if issuer_label_matches_category(label, name)
    ]
    if not matches:
        return None
    issuer_tokens = _tokens(label)

    def score(name: str) -> tuple[int, str]:
        return (len(issuer_tokens & _tokens(name)), name.lower())

    matches.sort(key=lambda item: (-score(item[1])[0], score(item[1])[1]))
    return matches[0][0]
