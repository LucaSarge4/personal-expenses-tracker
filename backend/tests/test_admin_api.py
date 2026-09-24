from datetime import date
from pathlib import Path

from sqlmodel import Session, select

from app.db import engine
from app.models import ImportStatus, Rule, StatementImport, Transaction
from app.seed import seed_categories


def test_reset_transactions_only_leaves_everything_else(client, tmp_path) -> None:
    account = client.post("/api/accounts", json={"name": "Reset Txn Account"}).json()
    category = client.post(
        "/api/categories", json={"name": "Reset Txn Cat", "kind": "expense", "color": "#123456"}
    ).json()
    with Session(engine) as session:
        session.add(
            Transaction(
                account_id=account["id"],
                date=date(2026, 1, 1),
                description_raw="A",
                amount_cents=-100,
                category_id=category["id"],
                dedupe_hash="reset-txn-1",
            )
        )
        session.commit()

    response = client.post("/api/admin/reset", json={"transactions": True})
    assert response.status_code == 200
    # >=1, not ==1: other tests in this shared DB leave orphan transactions
    # behind (e.g. ones whose account-delete is deliberately blocked by a
    # 409), so the global count includes more than just the one seeded here.
    assert response.json()["transactions_deleted"] >= 1

    remaining = client.get("/api/transactions", params={"account_id": account["id"]}).json()
    assert remaining["total"] == 0
    assert client.get("/api/accounts").json()
    assert any(c["id"] == category["id"] for c in client.get("/api/categories").json())


def test_reset_categories_cascades_rules_and_uncategorizes_transactions(client) -> None:
    account = client.post("/api/accounts", json={"name": "Reset Cat Account"}).json()
    category = client.post(
        "/api/categories", json={"name": "Reset Cat", "kind": "expense", "color": "#654321"}
    ).json()
    rule = client.post(
        "/api/rules", json={"match_text": "reset-cat-rule", "category_id": category["id"]}
    ).json()
    with Session(engine) as session:
        session.add(
            Transaction(
                account_id=account["id"],
                date=date(2026, 1, 1),
                description_raw="B",
                amount_cents=-200,
                category_id=category["id"],
                dedupe_hash="reset-cat-1",
            )
        )
        session.commit()

    response = client.post("/api/admin/reset", json={"categories": True})
    assert response.status_code == 200
    body = response.json()
    assert body["categories_deleted"] >= 1
    assert body["rules_deleted"] >= 1

    assert not any(c["id"] == category["id"] for c in client.get("/api/categories").json())
    with Session(engine) as session:
        assert session.exec(select(Rule).where(Rule.id == rule["id"])).first() is None

    remaining = client.get("/api/transactions", params={"account_id": account["id"]}).json()
    assert remaining["total"] == 1
    assert remaining["items"][0]["category_id"] is None

    # This test wipes every category in the shared test DB, but other test
    # files (which run after this one alphabetically) assume the app's
    # normal baseline of seeded categories exists — restore it the same way
    # a fresh app start would (seed_categories is idempotent).
    with Session(engine) as session:
        seed_categories(session)


def test_reset_imports_unlinks_transactions_without_deleting_them(client, tmp_path: Path) -> None:
    account = client.post("/api/accounts", json={"name": "Reset Import Account"}).json()
    stored_file = tmp_path / "statement.csv"
    stored_file.write_text("Data;Descrizione;Importo\n")

    with Session(engine) as session:
        statement_import = StatementImport(
            account_id=account["id"],
            filename="statement.csv",
            stored_path=str(stored_file),
            sha256="reset-import-sha",
            status=ImportStatus.review,
        )
        session.add(statement_import)
        session.commit()
        session.refresh(statement_import)
        import_id = statement_import.id

        session.add(
            Transaction(
                account_id=account["id"],
                import_id=import_id,
                date=date(2026, 1, 1),
                description_raw="C",
                amount_cents=-300,
                dedupe_hash="reset-import-1",
            )
        )
        session.commit()

    assert stored_file.exists()
    response = client.post("/api/admin/reset", json={"imports": True})
    assert response.status_code == 200
    assert response.json()["imports_deleted"] == 1
    assert not stored_file.exists()

    remaining = client.get("/api/transactions", params={"account_id": account["id"]}).json()
    assert remaining["total"] == 1
    assert remaining["items"][0]["import_id"] is None


def test_reset_accounts_cascades_transactions_and_imports(client, tmp_path: Path) -> None:
    account = client.post("/api/accounts", json={"name": "Reset Account Cascade"}).json()
    stored_file = tmp_path / "statement2.csv"
    stored_file.write_text("Data;Descrizione;Importo\n")

    with Session(engine) as session:
        statement_import = StatementImport(
            account_id=account["id"],
            filename="statement2.csv",
            stored_path=str(stored_file),
            sha256="reset-account-sha",
            status=ImportStatus.review,
        )
        session.add(statement_import)
        session.commit()
        session.refresh(statement_import)

        session.add(
            Transaction(
                account_id=account["id"],
                import_id=statement_import.id,
                date=date(2026, 1, 1),
                description_raw="D",
                amount_cents=-400,
                dedupe_hash="reset-account-1",
            )
        )
        session.commit()

    response = client.post("/api/admin/reset", json={"accounts": True})
    assert response.status_code == 200
    body = response.json()
    assert body["accounts_deleted"] >= 1
    assert body["imports_deleted"] >= 1
    assert body["transactions_deleted"] >= 1

    assert not any(a["id"] == account["id"] for a in client.get("/api/accounts").json())
    assert not stored_file.exists()
