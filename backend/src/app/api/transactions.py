import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.ingest.dedupe import normalize
from app.models import Account, Category, ClassifiedBy, Transaction
from app.schemas import (
    TransactionBatchCreate,
    TransactionBulkUpdate,
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
)

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("")
def list_transactions(
    year: int | None = None,
    month: int | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    import_id: int | None = None,
    needs_review: bool | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    amount_min: int | None = None,
    amount_max: int | None = None,
    type: Literal["income", "expense"] | None = None,
    uncategorized: bool | None = None,
    source: Literal["manual", "imported"] | None = None,
    page: int = 1,
    page_size: int = 50,
    session: Session = Depends(get_session),
) -> dict[str, object]:
    statement = select(Transaction)

    if year is not None and month is not None:
        start = date(year, month, 1)
        end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        statement = statement.where(Transaction.date >= start, Transaction.date < end)
    elif year is not None:
        statement = statement.where(
            Transaction.date >= date(year, 1, 1), Transaction.date < date(year + 1, 1, 1)
        )

    if account_id is not None:
        statement = statement.where(Transaction.account_id == account_id)
    if category_id is not None:
        statement = statement.where(Transaction.category_id == category_id)
    if import_id is not None:
        statement = statement.where(Transaction.import_id == import_id)
    if needs_review:
        statement = statement.where(Transaction.reviewed == False)  # noqa: E712
    if q:
        like = f"%{q}%"
        statement = statement.where(Transaction.description_raw.ilike(like))
    if date_from is not None:
        statement = statement.where(Transaction.date >= date_from)
    if date_to is not None:
        statement = statement.where(Transaction.date <= date_to)
    # Amount bounds apply to the magnitude, so "10 to 50" means the same for
    # money in and money out.
    if amount_min is not None:
        statement = statement.where(func.abs(Transaction.amount_cents) >= amount_min)
    if amount_max is not None:
        statement = statement.where(func.abs(Transaction.amount_cents) <= amount_max)
    if type == "income":
        statement = statement.where(Transaction.amount_cents > 0)
    elif type == "expense":
        statement = statement.where(Transaction.amount_cents < 0)
    if uncategorized:
        statement = statement.where(Transaction.category_id.is_(None))
    if source == "manual":
        statement = statement.where(Transaction.import_id.is_(None))
    elif source == "imported":
        statement = statement.where(Transaction.import_id.is_not(None))

    total = len(session.exec(statement).all())

    statement = (
        statement.order_by(Transaction.date.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    items = session.exec(statement).all()

    return {
        "items": [TransactionRead.model_validate(t, from_attributes=True) for t in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def _require_account(session: Session, account_id: int) -> Account:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


def _build_manual(payload: TransactionCreate, session: Session) -> Transaction:
    account = _require_account(session, payload.account_id)
    if payload.category_id is not None and session.get(Category, payload.category_id) is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return Transaction(
        account_id=account.id,
        import_id=None,
        date=payload.date,
        description_raw=payload.description_raw,
        counterparty=normalize(payload.description_raw),
        amount_cents=payload.amount_cents,
        currency=account.currency,
        category_id=payload.category_id,
        classified_by=ClassifiedBy.user if payload.category_id is not None else None,
        reviewed=True,
        notes=payload.notes,
        # Not derived from the content: a hand-entered row must never be
        # mistaken for (or block) a statement line on a later import.
        dedupe_hash=f"manual:{uuid.uuid4().hex}",
    )


@router.post("", response_model=TransactionRead, status_code=201)
def create_transaction(
    payload: TransactionCreate, session: Session = Depends(get_session)
) -> Transaction:
    txn = _build_manual(payload, session)
    session.add(txn)
    session.commit()
    session.refresh(txn)
    return txn


@router.post("/batch", response_model=list[TransactionRead], status_code=201)
def create_transactions(
    payload: TransactionBatchCreate, session: Session = Depends(get_session)
) -> list[Transaction]:
    # Validate everything before writing anything: the batch is all-or-nothing.
    txns = [_build_manual(item, session) for item in payload.items]
    session.add_all(txns)
    session.commit()
    for txn in txns:
        session.refresh(txn)
    return txns


@router.patch("/{transaction_id}", response_model=TransactionRead)
def update_transaction(
    transaction_id: int, payload: TransactionUpdate, session: Session = Depends(get_session)
) -> Transaction:
    txn = session.get(Transaction, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    data = payload.model_dump(exclude_unset=True)
    if "category_id" in data:
        txn.category_id = data["category_id"]
        txn.classified_by = ClassifiedBy.user
        txn.reviewed = True
    if "notes" in data:
        txn.notes = data["notes"]
    if "reviewed" in data:
        txn.reviewed = data["reviewed"]
    # dedupe_hash is deliberately left alone: it identifies the original
    # statement line, so re-importing that statement still skips this row.
    if data.get("date") is not None:
        txn.date = data["date"]
    if data.get("amount_cents") is not None:
        txn.amount_cents = data["amount_cents"]
    if data.get("description_raw") is not None:
        txn.description_raw = data["description_raw"]
        txn.counterparty = normalize(data["description_raw"])
    if data.get("account_id") is not None:
        txn.account_id = _require_account(session, data["account_id"]).id

    session.add(txn)
    session.commit()
    session.refresh(txn)
    return txn


@router.delete("/{transaction_id}")
def delete_transaction(
    transaction_id: int, session: Session = Depends(get_session)
) -> dict[str, bool]:
    txn = session.get(Transaction, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    session.delete(txn)
    session.commit()
    return {"ok": True}


@router.post("/bulk")
def bulk_update_transactions(
    payload: TransactionBulkUpdate, session: Session = Depends(get_session)
) -> dict[str, int]:
    txns = session.exec(select(Transaction).where(Transaction.id.in_(payload.ids))).all()
    for txn in txns:
        if payload.category_id is not None:
            txn.category_id = payload.category_id
            txn.classified_by = ClassifiedBy.user
        if payload.reviewed is not None:
            txn.reviewed = payload.reviewed
        session.add(txn)
    session.commit()
    return {"updated": len(txns)}
