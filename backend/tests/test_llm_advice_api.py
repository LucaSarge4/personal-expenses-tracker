import json
from datetime import date

from sqlmodel import Session

from app.db import engine
from app.models import Transaction
from app.schemas import AdviceItem


class _FakeAdviceResult:
    def __init__(self):
        self.summary = "Riassunto di prova."
        self.items = [AdviceItem(title="Consiglio", detail="Dettaglio del consiglio.")]


def _seed_transaction(
    account_id: int, category_id: int, amount_cents: int, txn_date: date, hash_: str
) -> None:
    with Session(engine) as session:
        session.add(
            Transaction(
                account_id=account_id,
                date=txn_date,
                description_raw="Advice test txn",
                amount_cents=amount_cents,
                category_id=category_id,
                dedupe_hash=hash_,
            )
        )
        session.commit()


def test_advice_all_period_returns_llm_result(client, monkeypatch) -> None:
    account = client.post("/api/accounts", json={"name": "Advice Account"}).json()
    category = client.post(
        "/api/categories", json={"name": "Advice Cat", "kind": "expense", "color": "#abcdef"}
    ).json()
    _seed_transaction(account["id"], category["id"], -5000, date(2026, 1, 5), "advice-txn-1")

    monkeypatch.setattr("app.api.llm.chat_json", lambda system, user, schema: _FakeAdviceResult())

    response = client.post("/api/llm/advice", json={"period": "all"})
    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == "Riassunto di prova."
    assert body["items"] == [{"title": "Consiglio", "detail": "Dettaglio del consiglio."}]
    assert body["period_label"] == "All time"


def test_advice_locale_override_uses_italian_labels(client, monkeypatch) -> None:
    account = client.post("/api/accounts", json={"name": "Advice Locale Account"}).json()
    category = client.post(
        "/api/categories", json={"name": "Advice Locale Cat", "kind": "expense", "color": "#123123"}
    ).json()
    _seed_transaction(account["id"], category["id"], -5000, date(2026, 1, 5), "advice-txn-locale")

    captured_system: list[str] = []

    def fake_chat_json(system, user, schema):
        captured_system.append(system)
        return _FakeAdviceResult()

    monkeypatch.setattr("app.api.llm.chat_json", fake_chat_json)

    response = client.post("/api/llm/advice", json={"period": "all", "locale": "it"})
    assert response.status_code == 200
    assert response.json()["period_label"] == "Tutto lo storico"
    assert "italiano" in captured_system[0].lower()


def test_advice_month_period_requires_year_and_month(client) -> None:
    response = client.post("/api/llm/advice", json={"period": "month"})
    assert response.status_code == 400


def test_advice_no_transactions_in_period_returns_400(client) -> None:
    response = client.post("/api/llm/advice", json={"period": "year", "year": 1999})
    assert response.status_code == 400


def test_advice_prompt_uses_configured_currency(client, monkeypatch) -> None:
    account = client.post("/api/accounts", json={"name": "Advice Currency Account"}).json()
    category = client.post(
        "/api/categories",
        json={"name": "Advice Currency Cat", "kind": "expense", "color": "#321321"},
    ).json()
    _seed_transaction(account["id"], category["id"], -5000, date(2026, 1, 5), "advice-txn-currency")
    client.put("/api/settings", json={"currency": "USD"})

    captured_user: list[str] = []

    def fake_chat_json(system, user, schema):
        captured_user.append(user)
        return _FakeAdviceResult()

    monkeypatch.setattr("app.api.llm.chat_json", fake_chat_json)

    response = client.post("/api/llm/advice", json={"period": "all"})
    assert response.status_code == 200
    payload = json.loads(captured_user[0])
    assert payload["currency"] == "USD"
    assert "expenses" in payload
