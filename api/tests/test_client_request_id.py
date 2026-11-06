"""Repeating a phone outbox id returns the original transaction."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _auth() -> dict[str, str]:
    username = f"user_{uuid.uuid4().hex[:10]}"
    response = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "testpass123",
        },
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_repeat_client_request_id_does_not_double_log() -> None:
    headers = _auth()
    category = client.post(
        "/api/categories",
        headers=headers,
        json={"kind": "expense", "name": "Groceries"},
    )
    assert category.status_code == 201, category.text
    category_id = category.json()["id"]
    body = {
        "category_id": category_id,
        "amount": "12.50",
        "date": "2026-11-06",
        "note": "market",
        "client_request_id": "outbox-abc123",
    }
    first = client.post("/api/transactions", headers=headers, json=body)
    assert first.status_code == 201, first.text
    second = client.post("/api/transactions", headers=headers, json=body)
    assert second.status_code == 201, second.text
    assert second.json()["id"] == first.json()["id"]
    listed = client.get("/api/transactions", headers=headers)
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 1
