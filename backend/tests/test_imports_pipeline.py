import time
from datetime import date
from decimal import Decimal

from sqlmodel import Session, select

from app.db import engine
from app.ingest.llm_extract import ExtractedTxn, ExtractionResult
from app.models import Transaction


def _wait_until_review(client, import_id: int, timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        data = client.get(f"/api/imports/{import_id}").json()
        if data["status"] in ("review", "error"):
            return data
        time.sleep(0.05)
    raise AssertionError("import did not reach review/error status in time")


def test_import_pipeline_end_to_end(client, monkeypatch) -> None:
    category = client.post(
        "/api/categories",
        json={"name": "Pipeline Test Cat", "kind": "expense", "color": "#654321"},
    ).json()
    account = client.post("/api/accounts", json={"name": "Pipeline Test Account"}).json()

    extraction_result = ExtractionResult(
        transactions=[
            ExtractedTxn(
                date=date(2026, 1, 5), description="ESSELUNGA MILANO", amount=Decimal("-25.50")
            ),
            ExtractedTxn(
                date=date(2026, 1, 10), description="BONIFICO STIPENDIO", amount=Decimal("1500.00")
            ),
        ],
        opening_balance=Decimal("1000.00"),
        closing_balance=Decimal("2474.50"),
    )
    monkeypatch.setattr(
        "app.ingest.llm_extract.chat_json", lambda system, user, schema: extraction_result
    )

    class FakeClassification:
        def __init__(self, results):
            self.results = results

    def fake_classify(system, user, schema):
        import re

        ids = [int(i) for i in re.findall(r"'id': (\d+)", user)]
        results = [
            type(
                "R",
                (),
                {"id": i, "category": category["name"], "confidence": 0.95, "reason": "test"},
            )()
            for i in ids
        ]
        return FakeClassification(results)

    monkeypatch.setattr("app.ingest.classify.chat_json", fake_classify)

    csv_bytes = (
        b"Data;Descrizione;Importo\n"
        b"05/01/2026;ESSELUNGA MILANO;-25,50\n"
        b"10/01/2026;BONIFICO STIPENDIO;1.500,00\n"
    )

    response = client.post(
        "/api/imports",
        params={"account_id": account["id"]},
        files=[("files", ("statement.csv", csv_bytes, "text/csv"))],
    )
    assert response.status_code == 200
    created = response.json()
    assert len(created) == 1
    import_id = created[0]["id"]

    result = _wait_until_review(client, import_id)
    assert result["status"] == "review"
    assert result["extracted_count"] == 2
    assert result["inserted_count"] == 2
    assert result["duplicate_count"] == 0
    assert result["reconcile_diff_cents"] == 0

    with Session(engine) as session:
        txns = session.exec(select(Transaction).where(Transaction.import_id == import_id)).all()
        assert len(txns) == 2
        assert all(t.category_id == category["id"] for t in txns)

    # Re-uploading the exact same file is refused.
    reupload = client.post(
        "/api/imports",
        params={"account_id": account["id"]},
        files=[("files", ("statement.csv", csv_bytes, "text/csv"))],
    )
    assert reupload.status_code == 409

    # An overlapping statement (different bytes, one shared txn + one new) only
    # inserts the new transaction and counts the shared one as a duplicate.
    overlapping_result = ExtractionResult(
        transactions=[
            ExtractedTxn(
                date=date(2026, 1, 10), description="BONIFICO STIPENDIO", amount=Decimal("1500.00")
            ),
            ExtractedTxn(date=date(2026, 2, 1), description="NETFLIX", amount=Decimal("-12.99")),
        ],
        opening_balance=None,
        closing_balance=None,
    )
    monkeypatch.setattr(
        "app.ingest.llm_extract.chat_json", lambda system, user, schema: overlapping_result
    )

    overlap_bytes = (
        b"Data;Descrizione;Importo\n"
        b"10/01/2026;BONIFICO STIPENDIO;1.500,00\n"
        b"01/02/2026;NETFLIX;-12,99\n"
    )
    overlap_response = client.post(
        "/api/imports",
        params={"account_id": account["id"]},
        files=[("files", ("statement2.csv", overlap_bytes, "text/csv"))],
    )
    assert overlap_response.status_code == 200
    overlap_import_id = overlap_response.json()[0]["id"]

    overlap_result = _wait_until_review(client, overlap_import_id)
    assert overlap_result["status"] == "review"
    assert overlap_result["inserted_count"] == 1
    assert overlap_result["duplicate_count"] == 1

    # Confirm marks everything reviewed and status done.
    confirm = client.post(f"/api/imports/{import_id}/confirm")
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "done"

    # Deleting an import with transactions must not hit a FK constraint
    # (transactions reference the import; they must be removed first).
    delete_response = client.delete(f"/api/imports/{overlap_import_id}")
    assert delete_response.status_code == 200

    with Session(engine) as session:
        remaining = session.exec(
            select(Transaction).where(Transaction.import_id == overlap_import_id)
        ).all()
        assert remaining == []
