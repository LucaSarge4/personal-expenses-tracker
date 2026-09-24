from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import ClassifiedBy, Transaction
from app.schemas import TransactionBulkUpdate, TransactionRead, TransactionUpdate

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
