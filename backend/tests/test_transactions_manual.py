"""Hand-entered transactions (no import, no LLM) and the extra list filters."""

import uuid
from datetime import date

from sqlmodel import Session

from app.db import engine
from app.ingest.dedupe import hashes_for_import
from app.models import ImportStatus, StatementImport, Transaction


def _unique(prefix: str) -> str:
    return f"{prefix} {uuid.uuid4().hex[:8]}"


def _account(client, **overrides) -> dict:
    return client.post("/api/accounts", json={"name": _unique("Acct"), **overrides}).json()


def _category(client, kind: str = "expense") -> dict:
    body = {"name": _unique("Cat"), "kind": kind, "color": "#123456"}
    return client.post("/api/categories", json=body).json()


def _body(account_id: int, **overrides) -> dict:
    return {
        "account_id": account_id,
        "date": "2026-03-04",
        "description_raw": "Coffee",
        "amount_cents": -350,
        **overrides,
    }


def _list(client, **params) -> dict:
    return client.get("/api/transactions", params={"page_size": 500, **params}).json()


def test_create_transaction_stores_a_reviewed_manual_row(client) -> None:
    account = _account(client, currency="USD")
    category = _category(client)

    response = client.post(
        "/api/transactions",
        json=_body(
            account["id"],
            description_raw="  Bar Centrale 1234567  ",
            category_id=category["id"],
            notes="with Anna",
        ),
    )

    assert response.status_code == 201
    txn = response.json()
    assert txn["import_id"] is None
    assert txn["description_raw"] == "Bar Centrale 1234567"
    assert txn["counterparty"] == "bar centrale"
    assert txn["amount_cents"] == -350
    assert txn["currency"] == "USD"
    assert txn["category_id"] == category["id"]
    assert txn["classified_by"] == "user"
    assert txn["reviewed"] is True
    assert txn["notes"] == "with Anna"
    with Session(engine) as session:
        assert session.get(Transaction, txn["id"]).dedupe_hash.startswith("manual:")


def test_two_identical_manual_transactions_are_both_kept(client) -> None:
    account = _account(client)
    for _ in range(2):
        assert client.post("/api/transactions", json=_body(account["id"])).status_code == 201
    assert _list(client, account_id=account["id"])["total"] == 2


def test_create_without_category_is_uncategorized(client) -> None:
    account = _account(client)
    txn = client.post("/api/transactions", json=_body(account["id"])).json()
    assert txn["category_id"] is None
    assert txn["classified_by"] is None


def test_create_rejects_unknown_references_and_bad_values(client) -> None:
    account = _account(client)
    assert client.post("/api/transactions", json=_body(999_999)).status_code == 404
    unknown_category = _body(account["id"], category_id=999_999)
    assert client.post("/api/transactions", json=unknown_category).status_code == 404
    zero = _body(account["id"], amount_cents=0)
    assert client.post("/api/transactions", json=zero).status_code == 422
    blank = _body(account["id"], description_raw="   ")
    assert client.post("/api/transactions", json=blank).status_code == 422
    assert _list(client, account_id=account["id"])["total"] == 0


def test_batch_creates_all_rows(client) -> None:
    account = _account(client)
    items = [
        _body(account["id"], description_raw="Rent", amount_cents=-90000),
        _body(account["id"], description_raw="Salary", amount_cents=250000),
    ]

    response = client.post("/api/transactions/batch", json={"items": items})

    assert response.status_code == 201
    assert [t["description_raw"] for t in response.json()] == ["Rent", "Salary"]
    assert _list(client, account_id=account["id"])["total"] == 2


def test_batch_is_all_or_nothing(client) -> None:
    account = _account(client)
    items = [_body(account["id"]), _body(account["id"], category_id=999_999)]
    assert client.post("/api/transactions/batch", json={"items": items}).status_code == 404

    items = [_body(account["id"]), _body(account["id"], amount_cents=0)]
    assert client.post("/api/transactions/batch", json={"items": items}).status_code == 422

    assert client.post("/api/transactions/batch", json={"items": []}).status_code == 422
    assert _list(client, account_id=account["id"])["total"] == 0


def test_patch_edits_every_field_but_keeps_the_dedupe_hash(client) -> None:
    account = _account(client)
    other = _account(client)
    [original_hash] = hashes_for_import(account["id"], [(date(2026, 1, 5), -2550, "ESSELUNGA")])
    with Session(engine) as session:
        statement = StatementImport(
            account_id=account["id"],
            filename="jan.csv",
            stored_path="/dev/null",
            sha256=uuid.uuid4().hex,
            status=ImportStatus.done,
        )
        session.add(statement)
        session.commit()
        txn = Transaction(
            account_id=account["id"],
            import_id=statement.id,
            date=date(2026, 1, 5),
            description_raw="ESSELUNGA",
            amount_cents=-2550,
            dedupe_hash=original_hash,
        )
        session.add(txn)
        session.commit()
        txn_id = txn.id

    response = client.patch(
        f"/api/transactions/{txn_id}",
        json={
            "date": "2026-01-06",
            "amount_cents": -2600,
            "description_raw": "Esselunga Milano",
            "account_id": other["id"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["date"] == "2026-01-06"
    assert body["amount_cents"] == -2600
    assert body["description_raw"] == "Esselunga Milano"
    assert body["counterparty"] == "esselunga milano"
    assert body["account_id"] == other["id"]
    with Session(engine) as session:
        # Re-importing the original statement line still finds this hash.
        assert session.get(Transaction, txn_id).dedupe_hash == original_hash


def test_patch_rejects_unknown_account_and_bad_values(client) -> None:
    account = _account(client)
    txn = client.post("/api/transactions", json=_body(account["id"])).json()
    url = f"/api/transactions/{txn['id']}"
    assert client.patch(url, json={"account_id": 999_999}).status_code == 404
    assert client.patch(url, json={"amount_cents": 0}).status_code == 422
    assert client.patch(url, json={"description_raw": " "}).status_code == 422
    assert (
        client.get("/api/transactions", params={"account_id": account["id"]}).json()["items"][0][
            "amount_cents"
        ]
        == -350
    )


def _seed_for_filters(client) -> tuple[int, int]:
    account = _account(client)
    category = _category(client)
    rows = [
        _body(account["id"], date="2026-01-31", description_raw="a", amount_cents=-1000),
        _body(
            account["id"],
            date="2026-02-01",
            description_raw="b",
            amount_cents=-5000,
            category_id=category["id"],
        ),
        _body(account["id"], date="2026-02-28", description_raw="c", amount_cents=3000),
        _body(account["id"], date="2026-03-01", description_raw="d", amount_cents=20000),
    ]
    client.post("/api/transactions/batch", json={"items": rows})
    with Session(engine) as session:
        statement = StatementImport(
            account_id=account["id"],
            filename="x.csv",
            stored_path="/dev/null",
            sha256=uuid.uuid4().hex,
        )
        session.add(statement)
        session.commit()
        session.add(
            Transaction(
                account_id=account["id"],
                import_id=statement.id,
                date=date(2026, 2, 15),
                description_raw="e",
                amount_cents=-4000,
                dedupe_hash=uuid.uuid4().hex,
            )
        )
        session.commit()
    return account["id"], category["id"]


def _descriptions(client, **params) -> list[str]:
    return sorted(t["description_raw"] for t in _list(client, **params)["items"])


def test_filters_by_inclusive_date_range(client) -> None:
    account_id, _ = _seed_for_filters(client)
    found = _descriptions(
        client, account_id=account_id, date_from="2026-02-01", date_to="2026-02-28"
    )
    assert found == ["b", "c", "e"]
    assert _descriptions(client, account_id=account_id, date_from="2026-03-01") == ["d"]
    assert _descriptions(client, account_id=account_id, date_to="2026-01-31") == ["a"]


def test_filters_by_amount_magnitude(client) -> None:
    account_id, _ = _seed_for_filters(client)
    found = _descriptions(client, account_id=account_id, amount_min=3000, amount_max=5000)
    assert found == ["b", "c", "e"]
    assert _descriptions(client, account_id=account_id, amount_min=10000) == ["d"]


def test_filters_by_type(client) -> None:
    account_id, _ = _seed_for_filters(client)
    assert _descriptions(client, account_id=account_id, type="income") == ["c", "d"]
    assert _descriptions(client, account_id=account_id, type="expense") == ["a", "b", "e"]
    assert client.get("/api/transactions", params={"type": "other"}).status_code == 422


def test_filters_by_uncategorized_and_source(client) -> None:
    account_id, _ = _seed_for_filters(client)
    assert _descriptions(client, account_id=account_id, uncategorized=True) == ["a", "c", "d", "e"]
    assert _descriptions(client, account_id=account_id, source="imported") == ["e"]
    assert _descriptions(client, account_id=account_id, source="manual") == ["a", "b", "c", "d"]


def test_filters_combine(client) -> None:
    account_id, category_id = _seed_for_filters(client)
    found = _descriptions(
        client,
        account_id=account_id,
        type="expense",
        source="manual",
        date_from="2026-01-01",
        date_to="2026-02-28",
        amount_min=2000,
    )
    assert found == ["b"]
    assert _descriptions(client, account_id=account_id, category_id=category_id) == ["b"]
