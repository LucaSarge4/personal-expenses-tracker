import re
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel, create_model
from sqlmodel import Session, select

from app.llm.client import chat_json
from app.models import Category, CategoryKind, ClassifiedBy, Rule, Transaction

_WHITESPACE_RE = re.compile(r"\s+")


def _normalize_for_matching(text: str) -> str:
    # PDF extraction wraps long statement lines, leaving newlines in the
    # middle of what's really one continuous phrase (e.g. "MAIN\nSTREET 7").
    # Collapse all whitespace runs to a single space so a rule written
    # against the "logical" line still matches.
    return _WHITESPACE_RE.sub(" ", text).strip().lower()


def apply_rules(session: Session, txns: list[Transaction]) -> list[Transaction]:
    rules = sorted(session.exec(select(Rule)).all(), key=lambda r: len(r.match_text), reverse=True)
    remaining = []
    for txn in txns:
        haystack = _normalize_for_matching(f"{txn.description_raw} {txn.counterparty}")
        matched = next(
            (r for r in rules if _normalize_for_matching(r.match_text) in haystack), None
        )
        if matched is not None:
            txn.category_id = matched.category_id
            txn.classified_by = ClassifiedBy.rule
            txn.confidence = 1.0
        else:
            remaining.append(txn)
    return remaining


def _build_category_schema(category_names: list[str]) -> type[BaseModel]:
    category_literal = Literal[*category_names]
    result_model = create_model(
        "DynamicClassificationResult",
        id=(int, ...),
        category=(category_literal, ...),
        confidence=(float, ...),
        reason=(str, ...),
    )
    return create_model(
        "DynamicClassificationBatch",
        results=(list[result_model], ...),
    )


def _few_shot_examples(session: Session, limit: int = 30) -> list[dict]:
    txns = session.exec(
        select(Transaction)
        .where(Transaction.reviewed == True)  # noqa: E712
        .order_by(Transaction.date.desc())
        .limit(limit)
    ).all()
    return [
        {
            "description": t.description_raw,
            "amount": str(t.amount_cents / 100),
            "category": (session.get(Category, t.category_id).name if t.category_id else None),
        }
        for t in txns
    ]


def llm_classify(
    session: Session,
    txns: list[Transaction],
    batch_size: int = 25,
    on_batch_done: Callable[[int, int], None] | None = None,
) -> None:
    if not txns:
        return

    categories = session.exec(
        select(Category).where(Category.archived == False)  # noqa: E712
    ).all()
    category_by_name = {c.name: c for c in categories}
    category_names = list(category_by_name.keys())
    schema = _build_category_schema(category_names)
    examples = _few_shot_examples(session)

    total_batches = (len(txns) + batch_size - 1) // batch_size
    for batch_num, i in enumerate(range(0, len(txns), batch_size), start=1):
        batch = txns[i : i + batch_size]
        batch_payload = [
            {
                "id": t.id,
                "date": t.date.isoformat(),
                "description": t.description_raw,
                "amount": t.amount_cents / 100,
            }
            for t in batch
        ]
        system = (
            "You classify bank transactions into one of the given categories.\n"
            "Categories (name, kind, hint): "
            + "; ".join(f"{c.name} ({c.kind.value}: {c.llm_hint})" for c in categories)
            + "\n\nRecent user-confirmed examples: "
            + str(examples)
        )
        user = f"Classify these transactions: {batch_payload}"

        response = chat_json(system=system, user=user, schema=schema)
        by_id = {r.id: r for r in response.results}

        for txn in batch:
            result = by_id.get(txn.id)
            if result is None:
                continue
            category = category_by_name.get(result.category)
            confidence = result.confidence
            if category is not None:
                is_expense_amount = txn.amount_cents < 0
                is_expense_category = category.kind == CategoryKind.expense
                sign_mismatch = is_expense_amount != is_expense_category
                if sign_mismatch and category.kind != CategoryKind.transfer:
                    confidence = confidence / 2
                txn.category_id = category.id
            txn.classified_by = ClassifiedBy.llm
            txn.confidence = confidence
            txn.llm_reason = result.reason

        if on_batch_done is not None:
            on_batch_done(batch_num, total_batches)
