"""Import API/pipeline paths beyond the happy path in test_imports_pipeline.py:
missing records, LLM failures, reclassification and database backups."""

import time
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlmodel import Session, select

from app.db import engine
from app.ingest import pipeline
from app.ingest.llm_extract import ExtractedTxn, ExtractionResult
from app.llm.client import LLMError
from app.models import ImportStatus, StatementImport, Transaction


def _wait_for_terminal_status(client, import_id: int, timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        data = client.get(f"/api/imports/{import_id}").json()
        if data["status"] in ("review", "error"):
            return data
        time.sleep(0.05)
    raise AssertionError("import did not finish in time")


def _upload(client, account_id: int, name: str = "statement.csv") -> dict:
    # Unique bytes per upload, so the duplicate-file check never interferes.
    content = f"Data;Descrizione;Importo\n05/01/2026;SHOP {uuid.uuid4()};-1,00\n".encode()
    response = client.post(
        "/api/imports",
        params={"account_id": account_id},
        files=[("files", (name, content, "text/csv"))],
    )
    assert response.status_code == 200, response.text
    return response.json()[0]


@pytest.fixture
def account(client) -> dict:
    return client.post("/api/accounts", json={"name": f"Edge {uuid.uuid4().hex[:6]}"}).json()


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/imports/999999"),
        ("post", "/api/imports/999999/confirm"),
        ("post", "/api/imports/999999/reclassify"),
        ("delete", "/api/imports/999999"),
    ],
)
def test_unknown_import_is_404(client, method, path) -> None:
    response = getattr(client, method)(path)
    assert response.status_code == 404
    assert response.json()["detail"] == "Import not found"


def test_upload_to_unknown_account_is_404(client) -> None:
    response = client.post(
        "/api/imports",
        params={"account_id": 999999},
        files=[("files", ("a.csv", b"x", "text/csv"))],
    )
    assert response.status_code == 404


def test_llm_failure_marks_import_as_error(client, account, monkeypatch) -> None:
    def boom(system, user, schema):
        raise LLMError("LLM server unreachable")

    monkeypatch.setattr("app.ingest.llm_extract.chat_json", boom)
    created = _upload(client, account["id"])

    result = _wait_for_terminal_status(client, created["id"])
    assert result["status"] == "error"
    assert "LLM server unreachable" in result["error"]
    assert result["inserted_count"] == 0


def test_run_import_ignores_unknown_ids() -> None:
    pipeline.run_import(999999)  # must not raise


def test_delete_import_removes_the_stored_file(client, account, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.ingest.llm_extract.chat_json",
        lambda system, user, schema: ExtractionResult(transactions=[]),
    )
    created = _upload(client, account["id"])
    _wait_for_terminal_status(client, created["id"])
    with Session(engine) as session:
        stored = Path(session.get(StatementImport, created["id"]).stored_path)
    assert stored.exists()

    assert client.delete(f"/api/imports/{created['id']}").status_code == 200
    assert not stored.exists()
    assert client.get(f"/api/imports/{created['id']}").status_code == 404


def test_reclassify_only_touches_unreviewed_transactions(client, account, monkeypatch) -> None:
    category = client.post(
        "/api/categories",
        json={"name": f"Reclass {uuid.uuid4().hex[:6]}", "kind": "expense", "color": "#123456"},
    ).json()
    monkeypatch.setattr(
        "app.ingest.llm_extract.chat_json",
        lambda system, user, schema: ExtractionResult(
            transactions=[
                ExtractedTxn(
                    date=date(2026, 3, 1), description=f"A {uuid.uuid4()}", amount=Decimal("-5")
                ),
                ExtractedTxn(
                    date=date(2026, 3, 2), description=f"B {uuid.uuid4()}", amount=Decimal("-6")
                ),
            ]
        ),
    )
    # First pass: the LLM is unsure about everything.
    responses = {"confidence": 0.3}

    def classify(system, user, schema):
        import re

        ids = [int(i) for i in re.findall(r"'id': (\d+)", user)]
        return SimpleNamespace(
            results=[
                SimpleNamespace(
                    id=i, category=category["name"], confidence=responses["confidence"], reason=""
                )
                for i in ids
            ]
        )

    monkeypatch.setattr("app.ingest.classify.chat_json", classify)
    created = _upload(client, account["id"])
    result = _wait_for_terminal_status(client, created["id"])
    assert result["low_confidence_count"] == 2

    with Session(engine) as session:
        txns = session.exec(
            select(Transaction)
            .where(Transaction.import_id == created["id"])
            .order_by(Transaction.id)
        ).all()
        reviewed_id = txns[0].id
        txns[0].reviewed = True
        txns[0].confidence = 0.1
        session.add(txns[0])
        session.commit()

    # Second pass: confident now; the reviewed transaction must keep its values.
    responses["confidence"] = 0.95
    response = client.post(f"/api/imports/{created['id']}/reclassify")
    assert response.status_code == 200
    assert response.json()["low_confidence_count"] == 0

    with Session(engine) as session:
        reviewed = session.get(Transaction, reviewed_id)
        assert reviewed.confidence == 0.1
        others = session.exec(
            select(Transaction).where(
                Transaction.import_id == created["id"], Transaction.id != reviewed_id
            )
        ).all()
        assert [t.confidence for t in others] == [0.95]


def test_backup_keeps_only_the_20_most_recent(tmp_path, monkeypatch) -> None:
    db = tmp_path / "expenses.db"
    db.write_bytes(b"sqlite")
    backups = tmp_path / "backups"
    backups.mkdir()
    for i in range(25):
        (backups / f"expenses-20200101T0000{i:02d}.db").write_bytes(b"old")
    monkeypatch.setattr(pipeline, "settings", SimpleNamespace(db_path=db, backups_dir=backups))

    pipeline.backup_database()

    remaining = sorted(p.name for p in backups.glob("expenses-*.db"))
    assert len(remaining) == 20
    assert "expenses-20200101T000000.db" not in remaining  # oldest pruned first
    newest = backups / remaining[-1]
    assert newest.read_bytes() == b"sqlite"


def test_backup_is_skipped_without_a_database(tmp_path, monkeypatch) -> None:
    backups = tmp_path / "backups"
    monkeypatch.setattr(
        pipeline, "settings", SimpleNamespace(db_path=tmp_path / "missing.db", backups_dir=backups)
    )
    pipeline.backup_database()
    assert not backups.exists()


def test_confirm_marks_import_done(client, account, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.ingest.llm_extract.chat_json",
        lambda system, user, schema: ExtractionResult(transactions=[]),
    )
    created = _upload(client, account["id"])
    _wait_for_terminal_status(client, created["id"])
    assert (
        client.post(f"/api/imports/{created['id']}/confirm").json()["status"] == ImportStatus.done
    )
