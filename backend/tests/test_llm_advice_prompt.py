"""What the advice endpoint sends to the LLM, and how it reports failures.
Each test uses its own account (and filters by it) so shared test data can't leak in."""

import json
import uuid
from datetime import date

import pytest
from sqlmodel import Session

from app.api import llm as llm_api
from app.db import engine
from app.llm.client import LLMError
from app.models import Transaction
from app.schemas import AdviceItem


class _Result:
    summary = "ok"
    items = [AdviceItem(title="t", detail="d")]


@pytest.fixture
def captured(monkeypatch) -> list[dict]:
    calls: list[dict] = []

    def fake(system, user, schema):
        calls.append({"system": system, "payload": json.loads(user)})
        return _Result()

    monkeypatch.setattr("app.api.llm.chat_json", fake)
    return calls


@pytest.fixture
def ledger(client):
    """An isolated account with income and expense categories."""
    account = client.post("/api/accounts", json={"name": f"Advice {uuid.uuid4().hex[:6]}"}).json()
    expense = client.post(
        "/api/categories",
        json={"name": f"Food {uuid.uuid4().hex[:6]}", "kind": "expense", "color": "#111111"},
    ).json()
    income = client.post(
        "/api/categories",
        json={"name": f"Pay {uuid.uuid4().hex[:6]}", "kind": "income", "color": "#222222"},
    ).json()

    def add(
        amount_cents: int, on: date, category: dict | None = None, reviewed: bool = True
    ) -> None:
        cat = category or (income if amount_cents > 0 else expense)
        with Session(engine) as session:
            session.add(
                Transaction(
                    account_id=account["id"],
                    date=on,
                    description_raw="advice",
                    amount_cents=amount_cents,
                    category_id=cat["id"] if cat else None,
                    reviewed=reviewed,
                    dedupe_hash=uuid.uuid4().hex,
                )
            )
            session.commit()

    return account, add


def test_year_period_sends_totals_and_a_monthly_trend(client, captured, ledger) -> None:
    account, add = ledger
    add(200000, date(2031, 1, 25))
    add(-50000, date(2031, 1, 10))
    add(-30000, date(2031, 2, 10))
    add(-99999, date(2030, 12, 31))  # outside the year

    response = client.post(
        "/api/llm/advice",
        json={"period": "year", "year": 2031, "account_id": account["id"], "locale": "en"},
    )
    assert response.status_code == 200
    assert response.json()["period_label"] == "2031"

    payload = captured[0]["payload"]
    assert payload["income"] == 2000.0
    assert payload["expenses"] == 800.0
    assert payload["net"] == 1200.0
    assert payload["savings_rate"] == 0.6
    assert [t["label"] for t in payload["trend"]] == ["January", "February"]
    assert "user_question" not in payload


def test_month_period_has_no_trend_and_counts_data_quality(client, captured, ledger) -> None:
    account, add = ledger
    add(-1000, date(2031, 12, 5), reviewed=False)
    add(-2000, date(2031, 12, 6), category={"id": None}, reviewed=True)

    response = client.post(
        "/api/llm/advice",
        json={
            "period": "month",
            "year": 2031,
            "month": 12,
            "account_id": account["id"],
            "locale": "en",
        },
    )
    assert response.status_code == 200
    assert response.json()["period_label"] == "December 2031"
    payload = captured[0]["payload"]
    assert "trend" not in payload
    assert payload["uncategorized_transactions"] == 1
    assert payload["unreviewed_transactions"] == 1


def test_a_custom_question_switches_to_the_question_prompt(client, captured, ledger) -> None:
    account, add = ledger
    add(-1000, date(2031, 3, 1))
    client.post(
        "/api/llm/advice",
        json={
            "period": "all",
            "account_id": account["id"],
            "question": "  Can I afford a car?  ",
            "locale": "en",
        },
    )
    assert captured[0]["payload"]["user_question"] == "Can I afford a car?"
    assert captured[0]["system"] == llm_api.QUESTION_SYSTEM_PROMPTS["en"]


def test_year_period_requires_a_year(client) -> None:
    assert client.post("/api/llm/advice", json={"period": "year"}).status_code == 400


def test_llm_failures_become_502(client, ledger, monkeypatch) -> None:
    account, add = ledger
    add(-1000, date(2031, 4, 1))

    def fail(system, user, schema):
        raise LLMError("timeout")

    monkeypatch.setattr("app.api.llm.chat_json", fail)
    response = client.post("/api/llm/advice", json={"period": "all", "account_id": account["id"]})
    assert response.status_code == 502
    assert "timeout" in response.json()["detail"]


def test_models_and_connection_test_endpoints(client, monkeypatch) -> None:
    monkeypatch.setattr("app.api.llm.list_models", lambda: ["gemma4:26b"])
    monkeypatch.setattr("app.api.llm.timed_test_call", lambda: {"ok": True, "latency_ms": 12.5})
    assert client.get("/api/llm/models").json() == ["gemma4:26b"]
    assert client.post("/api/llm/test").json() == {"ok": True, "latency_ms": 12.5}
