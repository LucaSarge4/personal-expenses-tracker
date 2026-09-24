from datetime import date

from sqlmodel import Session

from app.db import engine
from app.models import ImportStatus, StatementImport, Transaction


def _seed_transactions(account_id: int, category_id: int, prefix: str) -> None:
    with Session(engine) as session:
        session.add_all(
            [
                Transaction(
                    account_id=account_id,
                    date=date(2026, 1, 5),
                    description_raw="ESSELUNGA MILANO",
                    amount_cents=-2550,
                    category_id=category_id,
                    dedupe_hash=f"{prefix}-1",
                ),
                Transaction(
                    account_id=account_id,
                    date=date(2026, 2, 10),
                    description_raw="NETFLIX",
                    amount_cents=-1299,
                    dedupe_hash=f"{prefix}-2",
                ),
                Transaction(
                    account_id=account_id,
                    date=date(2025, 12, 1),
                    description_raw="OLD YEAR TXN",
                    amount_cents=-500,
                    dedupe_hash=f"{prefix}-3",
                ),
            ]
        )
        session.commit()


def test_list_transactions_filters_by_year_month_and_search(client) -> None:
    account = client.post("/api/accounts", json={"name": "Txn API Account"}).json()
    category = client.post(
        "/api/categories", json={"name": "Txn API Cat", "kind": "expense", "color": "#abcdef"}
    ).json()
    _seed_transactions(account["id"], category["id"], prefix=account["name"])

    all_for_account = client.get("/api/transactions", params={"account_id": account["id"]}).json()
    assert all_for_account["total"] == 3

    by_year = client.get(
        "/api/transactions", params={"account_id": account["id"], "year": 2026}
    ).json()
    assert by_year["total"] == 2

    by_year_month = client.get(
        "/api/transactions",
        params={"account_id": account["id"], "year": 2026, "month": 1},
    ).json()
    assert by_year_month["total"] == 1
    assert by_year_month["items"][0]["description_raw"] == "ESSELUNGA MILANO"

    by_category = client.get(
        "/api/transactions",
        params={"account_id": account["id"], "category_id": category["id"]},
    ).json()
    assert by_category["total"] == 1

    needs_review = client.get(
        "/api/transactions", params={"account_id": account["id"], "needs_review": True}
    ).json()
    assert needs_review["total"] == 3

    search = client.get(
        "/api/transactions", params={"account_id": account["id"], "q": "netflix"}
    ).json()
    assert search["total"] == 1
    assert search["items"][0]["description_raw"] == "NETFLIX"

    netflix_id = search["items"][0]["id"]
    with Session(engine) as session:
        statement_import = StatementImport(
            account_id=account["id"],
            filename="txn-filter-test.csv",
            stored_path="/dev/null",
            sha256="txn-filter-test-sha",
            status=ImportStatus.review,
        )
        session.add(statement_import)
        session.commit()
        session.refresh(statement_import)
        import_id = statement_import.id

        txn = session.get(Transaction, netflix_id)
        txn.import_id = import_id
        session.add(txn)
        session.commit()

    by_import = client.get(
        "/api/transactions", params={"account_id": account["id"], "import_id": import_id}
    ).json()
    assert by_import["total"] == 1
    assert by_import["items"][0]["description_raw"] == "NETFLIX"


def test_patch_transaction_sets_user_classified_and_reviewed(client) -> None:
    account = client.post("/api/accounts", json={"name": "Patch Account"}).json()
    category = client.post(
        "/api/categories", json={"name": "Patch Cat", "kind": "expense", "color": "#111111"}
    ).json()
    _seed_transactions(account["id"], category["id"], prefix=account["name"])

    listed = client.get("/api/transactions", params={"account_id": account["id"]}).json()
    txn_id = next(t["id"] for t in listed["items"] if t["description_raw"] == "NETFLIX")

    other_category = client.post(
        "/api/categories", json={"name": "Patch Cat 2", "kind": "expense", "color": "#222222"}
    ).json()

    response = client.patch(
        f"/api/transactions/{txn_id}",
        json={"category_id": other_category["id"], "notes": "subscription"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["category_id"] == other_category["id"]
    assert data["classified_by"] == "user"
    assert data["reviewed"] is True
    assert data["notes"] == "subscription"


def test_bulk_update_transactions(client) -> None:
    account = client.post("/api/accounts", json={"name": "Bulk Account"}).json()
    category = client.post(
        "/api/categories", json={"name": "Bulk Cat", "kind": "expense", "color": "#333333"}
    ).json()
    _seed_transactions(account["id"], category["id"], prefix=account["name"])

    listed = client.get("/api/transactions", params={"account_id": account["id"]}).json()
    ids = [t["id"] for t in listed["items"]]

    response = client.post("/api/transactions/bulk", json={"ids": ids, "reviewed": True})
    assert response.status_code == 200
    assert response.json()["updated"] == len(ids)

    refreshed = client.get("/api/transactions", params={"account_id": account["id"]}).json()
    assert all(t["reviewed"] for t in refreshed["items"])


def test_delete_transaction(client) -> None:
    account = client.post("/api/accounts", json={"name": "Delete Account"}).json()
    category = client.post(
        "/api/categories", json={"name": "Delete Cat", "kind": "expense", "color": "#444444"}
    ).json()
    _seed_transactions(account["id"], category["id"], prefix=account["name"])

    listed = client.get("/api/transactions", params={"account_id": account["id"]}).json()
    txn_id = next(t["id"] for t in listed["items"] if t["description_raw"] == "NETFLIX")

    response = client.delete(f"/api/transactions/{txn_id}")
    assert response.status_code == 200
    assert response.json() == {"ok": True}

    refreshed = client.get("/api/transactions", params={"account_id": account["id"]}).json()
    assert refreshed["total"] == 2
    assert all(t["id"] != txn_id for t in refreshed["items"])

    missing = client.delete(f"/api/transactions/{txn_id}")
    assert missing.status_code == 404
