from datetime import date

from app.ingest.dedupe import dedupe_hash, hashes_for_import, normalize


def test_normalize_lowercases_and_collapses_whitespace() -> None:
    assert normalize("  ESSELUNGA   MILANO  ") == "esselunga milano"


def test_normalize_strips_long_digit_tokens() -> None:
    assert normalize("PAGAMENTO POS 1234567890 ESSELUNGA") == "pagamento pos esselunga"


def test_normalize_keeps_short_digit_tokens() -> None:
    assert normalize("BAR 24H") == "bar 24h"


def test_dedupe_hash_is_stable() -> None:
    h1 = dedupe_hash(1, date(2026, 1, 5), -2550, "esselunga", 0)
    h2 = dedupe_hash(1, date(2026, 1, 5), -2550, "esselunga", 0)
    assert h1 == h2


def test_dedupe_hash_differs_by_occurrence() -> None:
    h1 = dedupe_hash(1, date(2026, 1, 5), -500, "bar", 0)
    h2 = dedupe_hash(1, date(2026, 1, 5), -500, "bar", 1)
    assert h1 != h2


def test_same_day_identical_transactions_stay_separate() -> None:
    items = [
        (date(2026, 1, 5), -500, "BAR MILANO"),
        (date(2026, 1, 5), -500, "BAR MILANO"),
    ]
    hashes = hashes_for_import(1, items)
    assert len(set(hashes)) == 2


def test_overlapping_imports_produce_same_hashes() -> None:
    statement = [
        (date(2026, 1, 5), -2550, "ESSELUNGA MILANO"),
        (date(2026, 1, 10), 150000, "BONIFICO STIPENDIO"),
        (date(2026, 1, 15), -6000, "ENEL ENERGIA"),
    ]
    overlapping_next_month_statement = [
        (date(2026, 1, 10), 150000, "BONIFICO STIPENDIO"),
        (date(2026, 1, 15), -6000, "ENEL ENERGIA"),
        (date(2026, 2, 1), -1000, "NETFLIX"),
    ]

    first_import_hashes = hashes_for_import(1, statement)
    second_import_hashes = hashes_for_import(1, overlapping_next_month_statement)

    # The two overlapping transactions produce identical hashes, so inserting
    # the second import (with an existing-hash check) skips them and leaves
    # exactly one row for each.
    overlap = set(first_import_hashes) & set(second_import_hashes)
    assert len(overlap) == 2
