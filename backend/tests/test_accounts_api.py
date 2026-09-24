from datetime import date

from sqlmodel import Session

from app.db import engine
from app.models import Transaction


def test_create_list_update_account(client) -> None:
    create = client.post("/api/accounts", json={"name": "Intesa conto", "bank": "Intesa"})
    assert create.status_code == 200
    account = create.json()

    listed = client.get("/api/accounts").json()
    assert any(a["id"] == account["id"] for a in listed)

    update = client.patch(f"/api/accounts/{account['id']}", json={"notes": "primary"})
    assert update.status_code == 200
    assert update.json()["notes"] == "primary"


def test_delete_account_without_transactions(client) -> None:
    account = client.post("/api/accounts", json={"name": "Throwaway"}).json()
    response = client.delete(f"/api/accounts/{account['id']}")
    assert response.status_code == 200


def test_delete_account_blocked_when_has_transactions(client) -> None:
    account = client.post("/api/accounts", json={"name": "Has Transactions"}).json()

    with Session(engine) as session:
        session.add(
            Transaction(
                account_id=account["id"],
                date=date(2026, 1, 1),
                description_raw="test",
                amount_cents=-500,
                dedupe_hash="delete-account-test",
            )
        )
        session.commit()

    response = client.delete(f"/api/accounts/{account['id']}")
    assert response.status_code == 409
