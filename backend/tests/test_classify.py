from datetime import date

from sqlmodel import Session, SQLModel, create_engine

from app.ingest.classify import apply_rules, llm_classify
from app.models import Category, CategoryKind, ClassifiedBy, Rule, Transaction


def _make_session():
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_apply_rules_longest_match_wins() -> None:
    session = _make_session()
    grocery = Category(name="Spesa", kind=CategoryKind.expense, color="#111111")
    esselunga = Category(name="Esselunga", kind=CategoryKind.expense, color="#222222")
    session.add(grocery)
    session.add(esselunga)
    session.commit()
    session.refresh(grocery)
    session.refresh(esselunga)

    session.add(Rule(match_text="esse", category_id=grocery.id))
    session.add(Rule(match_text="esselunga milano", category_id=esselunga.id))
    session.commit()

    txn = Transaction(
        account_id=1,
        date=date(2026, 1, 5),
        description_raw="PAGAMENTO ESSELUNGA MILANO",
        amount_cents=-2550,
        dedupe_hash="rule-test-1",
    )
    session.add(txn)
    session.commit()
    session.refresh(txn)

    remaining = apply_rules(session, [txn])

    assert remaining == []
    assert txn.category_id == esselunga.id
    assert txn.classified_by == ClassifiedBy.rule
    assert txn.confidence == 1.0


def test_apply_rules_leaves_unmatched_transactions() -> None:
    session = _make_session()
    txn = Transaction(
        account_id=1,
        date=date(2026, 1, 5),
        description_raw="UNKNOWN MERCHANT",
        amount_cents=-1000,
        dedupe_hash="rule-test-2",
    )
    session.add(txn)
    session.commit()
    session.refresh(txn)

    remaining = apply_rules(session, [txn])

    assert remaining == [txn]
    assert txn.category_id is None


def test_llm_classify_assigns_category(monkeypatch) -> None:
    session = _make_session()
    expense = Category(name="Spesa", kind=CategoryKind.expense, color="#111111")
    session.add(expense)
    session.commit()
    session.refresh(expense)

    txn = Transaction(
        account_id=1,
        date=date(2026, 1, 5),
        description_raw="ESSELUNGA MILANO",
        amount_cents=-2550,
        dedupe_hash="llm-test-1",
    )
    session.add(txn)
    session.commit()
    session.refresh(txn)

    class FakeResult:
        results = [
            type(
                "R",
                (),
                {"id": txn.id, "category": "Spesa", "confidence": 0.9, "reason": "grocery store"},
            )()
        ]

    monkeypatch.setattr("app.ingest.classify.chat_json", lambda system, user, schema: FakeResult())

    llm_classify(session, [txn])

    assert txn.category_id == expense.id
    assert txn.classified_by == ClassifiedBy.llm
    assert txn.confidence == 0.9


def test_llm_classify_halves_confidence_on_sign_mismatch(monkeypatch) -> None:
    session = _make_session()
    expense = Category(name="Spesa", kind=CategoryKind.expense, color="#111111")
    session.add(expense)
    session.commit()
    session.refresh(expense)

    # positive amount (inflow) classified as an expense category => sign mismatch
    txn = Transaction(
        account_id=1,
        date=date(2026, 1, 5),
        description_raw="RIMBORSO ESSELUNGA",
        amount_cents=2550,
        dedupe_hash="llm-test-2",
    )
    session.add(txn)
    session.commit()
    session.refresh(txn)

    class FakeResult:
        results = [
            type(
                "R",
                (),
                {"id": txn.id, "category": "Spesa", "confidence": 0.8, "reason": "refund"},
            )()
        ]

    monkeypatch.setattr("app.ingest.classify.chat_json", lambda system, user, schema: FakeResult())

    llm_classify(session, [txn])

    assert txn.confidence == 0.4
