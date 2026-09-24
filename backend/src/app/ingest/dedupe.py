import hashlib
import re
from datetime import date

DIGIT_TOKEN_RE = re.compile(r"\b\d{7,}\b")
WHITESPACE_RE = re.compile(r"\s+")


def normalize(desc: str) -> str:
    lowered = desc.lower()
    stripped = DIGIT_TOKEN_RE.sub("", lowered)
    return WHITESPACE_RE.sub(" ", stripped).strip()


def dedupe_hash(
    account_id: int,
    txn_date: date,
    amount_cents: int,
    normalized_desc: str,
    occurrence_idx: int,
) -> str:
    payload = (
        f"{account_id}|{txn_date.isoformat()}|{amount_cents}|{normalized_desc}|{occurrence_idx}"
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def hashes_for_import(account_id: int, items: list[tuple[date, int, str]]) -> list[str]:
    """Compute a stable dedupe hash for each (date, amount_cents, description) triple.

    `occurrence_idx` counts identical triples in the order they appear, so two
    identical same-day transactions get distinct hashes, while re-importing an
    overlapping statement reproduces the same hashes (since items are processed
    in the same order both times) and the unique index rejects the duplicates.
    """
    seen: dict[tuple[date, int, str], int] = {}
    hashes = []
    for txn_date, amount_cents, desc in items:
        normalized_desc = normalize(desc)
        key = (txn_date, amount_cents, normalized_desc)
        occurrence_idx = seen.get(key, 0)
        seen[key] = occurrence_idx + 1
        hashes.append(
            dedupe_hash(account_id, txn_date, amount_cents, normalized_desc, occurrence_idx)
        )
    return hashes
