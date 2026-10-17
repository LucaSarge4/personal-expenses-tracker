"""Error contracts and data-integrity rules of the CRUD endpoints, so that
refactors can't silently change status codes the frontend relies on."""

import uuid
from datetime import date

import pytest
from sqlmodel import Session

from app.db import engine
from app.models import Rule, Transaction


def _unique(prefix: str) -> str:
    return f"{prefix} {uuid.uuid4().hex[:8]}"


def _category(client, **overrides) -> dict:
    body = {"name": _unique("Cat"), "kind": "expense", "color": "#000000", **overrides}
    return client.post("/api/categories", json=body).json()


def _account(client) -> dict:
    return client.post("/api/accounts", json={"name": _unique("Acct")}).json()


def _transaction(account_id: int, **fields) -> int:
    with Session(engine) as session:
        txn = Transaction(
            account_id=account_id,
            date=date(2026, 1, 1),
            description_raw="test",
            amount_cents=-100,
            dedupe_hash=uuid.uuid4().hex,
            **fields,
        )
        session.add(txn)
        session.commit()
        session.refresh(txn)
        return txn.id


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("patch", "/api/categories/999999", {"name": "x"}),
        ("post", "/api/categories/999999/archive", None),
        ("delete", "/api/categories/999999", None),
        ("patch", "/api/accounts/999999", {"name": "x"}),
        ("delete", "/api/accounts/999999", None),
        ("patch", "/api/transactions/999999", {"notes": "x"}),
        ("delete", "/api/transactions/999999", None),
    ],
)
def test_missing_records_return_404(client, method, path, body) -> None:
    kwargs = {"json": body} if body is not None else {}
    assert client.request(method.upper(), path, **kwargs).status_code == 404


def test_reorder_with_an_unknown_category_is_404(client) -> None:
    known = _category(client)
    response = client.put("/api/categories/order", json={"ids": [known["id"], 999999]})
    assert response.status_code == 404


def test_merge_into_itself_is_rejected(client) -> None:
    cat = _category(client)
    response = client.post(f"/api/categories/{cat['id']}/merge", json={"target_id": cat["id"]})
    assert response.status_code == 400


def test_merge_into_unknown_category_is_404(client) -> None:
    cat = _category(client)
    response = client.post(f"/api/categories/{cat['id']}/merge", json={"target_id": 999999})
    assert response.status_code == 404


def test_merge_moves_transactions_and_rules(client) -> None:
    source, target = _category(client), _category(client)
    account = _account(client)
    txn_id = _transaction(account["id"], category_id=source["id"])
    rule = client.post(
        "/api/rules", json={"match_text": _unique("shop"), "category_id": source["id"]}
    ).json()

    response = client.post(
        f"/api/categories/{source['id']}/merge", json={"target_id": target["id"]}
    )
    assert response.status_code == 200

    with Session(engine) as session:
        assert session.get(Transaction, txn_id).category_id == target["id"]
        assert session.get(Rule, rule["id"]).category_id == target["id"]


def test_unused_category_can_be_deleted(client) -> None:
    cat = _category(client)
    assert client.delete(f"/api/categories/{cat['id']}").status_code == 200
    ids = [c["id"] for c in client.get("/api/categories?include_archived=true").json()]
    assert cat["id"] not in ids


def test_manual_recategorization_marks_the_transaction_reviewed(client) -> None:
    account, cat = _account(client), _category(client)
    txn_id = _transaction(account["id"], classified_by="llm", confidence=0.4)

    data = client.patch(f"/api/transactions/{txn_id}", json={"category_id": cat["id"]}).json()

    assert data["category_id"] == cat["id"]
    assert data["classified_by"] == "user"
    assert data["reviewed"] is True


def test_notes_and_reviewed_can_change_without_touching_the_category(client) -> None:
    account, cat = _account(client), _category(client)
    txn_id = _transaction(account["id"], category_id=cat["id"], classified_by="llm")

    data = client.patch(
        f"/api/transactions/{txn_id}", json={"notes": "split with Anna", "reviewed": False}
    ).json()

    assert data["notes"] == "split with Anna"
    assert data["reviewed"] is False
    assert data["category_id"] == cat["id"]
    assert data["classified_by"] == "llm"


def test_bulk_update_only_changes_the_given_fields(client) -> None:
    account, old, new = _account(client), _category(client), _category(client)
    ids = [_transaction(account["id"], category_id=old["id"]) for _ in range(2)]
    untouched = _transaction(account["id"], category_id=old["id"])

    response = client.post(
        "/api/transactions/bulk", json={"ids": [*ids, 999999], "category_id": new["id"]}
    )
    assert response.json() == {"updated": 2}  # unknown ids are ignored

    with Session(engine) as session:
        for txn_id in ids:
            txn = session.get(Transaction, txn_id)
            assert txn.category_id == new["id"]
            assert txn.classified_by == "user"
            assert txn.reviewed is False
        assert session.get(Transaction, untouched).category_id == old["id"]

    client.post("/api/transactions/bulk", json={"ids": ids, "reviewed": True})
    with Session(engine) as session:
        assert all(session.get(Transaction, i).reviewed for i in ids)
        assert all(session.get(Transaction, i).category_id == new["id"] for i in ids)


def test_deleting_a_transaction_removes_it(client) -> None:
    account = _account(client)
    txn_id = _transaction(account["id"])
    assert client.delete(f"/api/transactions/{txn_id}").status_code == 200
    assert client.delete(f"/api/transactions/{txn_id}").status_code == 404
