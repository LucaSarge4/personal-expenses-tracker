from datetime import date
from decimal import Decimal

from app.ingest.llm_extract import ExtractedTxn, ExtractionResult, extract_transactions, reconcile


def test_extract_transactions_merges_chunks(monkeypatch) -> None:
    results = [
        ExtractionResult(
            transactions=[
                ExtractedTxn(date="2026-01-05", description="ESSELUNGA", amount=Decimal("-25.50")),
            ],
            opening_balance=Decimal("1000.00"),
            closing_balance=None,
        ),
        ExtractionResult(
            transactions=[
                ExtractedTxn(date="2026-01-10", description="STIPENDIO", amount=Decimal("1500.00")),
            ],
            opening_balance=None,
            closing_balance=Decimal("2474.50"),
        ),
    ]
    calls = iter(results)
    monkeypatch.setattr(
        "app.ingest.llm_extract.chat_json", lambda system, user, schema: next(calls)
    )

    result = extract_transactions(["chunk 1", "chunk 2"])

    assert len(result.transactions) == 2
    assert result.opening_balance == Decimal("1000.00")
    assert result.closing_balance == Decimal("2474.50")


def test_reconcile_matches() -> None:
    result = ExtractionResult(
        transactions=[
            ExtractedTxn(date="2026-01-05", description="A", amount=Decimal("-25.50")),
            ExtractedTxn(date="2026-01-10", description="B", amount=Decimal("1500.00")),
        ],
        opening_balance=Decimal("1000.00"),
        closing_balance=Decimal("2474.50"),
    )
    assert reconcile(result) == Decimal("0.00")


def test_reconcile_flags_mismatch() -> None:
    result = ExtractionResult(
        transactions=[ExtractedTxn(date="2026-01-05", description="A", amount=Decimal("-25.50"))],
        opening_balance=Decimal("1000.00"),
        closing_balance=Decimal("2000.00"),
    )
    diff = reconcile(result)
    assert diff is not None
    assert diff != Decimal("0")


def test_reconcile_none_without_balances() -> None:
    result = ExtractionResult(transactions=[])
    assert reconcile(result) is None


def test_extracted_txn_tolerates_source_dd_mm_yyyy_date() -> None:
    # A live gemma4 run showed the model sometimes echoes the source's
    # dd/mm/yyyy format (or worse, scrambles it) despite the prompt asking
    # for ISO output. The dd/mm/yyyy case is recoverable; guard it here.
    txn = ExtractedTxn(date="25/03/2026", description="A", amount=Decimal("-10.00"))
    assert txn.date == date(2026, 3, 25)
