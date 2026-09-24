from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import Account, Transaction
from app.schemas import AccountCreate, AccountRead, AccountUpdate

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountRead])
def list_accounts(session: Session = Depends(get_session)) -> list[Account]:
    return list(session.exec(select(Account).order_by(Account.name)).all())


@router.post("", response_model=AccountRead)
def create_account(payload: AccountCreate, session: Session = Depends(get_session)) -> Account:
    account = Account(**payload.model_dump())
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.patch("/{account_id}", response_model=AccountRead)
def update_account(
    account_id: int, payload: AccountUpdate, session: Session = Depends(get_session)
) -> Account:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(account, key, value)
    session.add(account)
    session.commit()
    session.refresh(account)
    return account


@router.delete("/{account_id}")
def delete_account(account_id: int, session: Session = Depends(get_session)) -> dict[str, bool]:
    account = session.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    in_use = session.exec(select(Transaction).where(Transaction.account_id == account_id)).first()
    if in_use is not None:
        raise HTTPException(status_code=409, detail="Account has transactions")

    session.delete(account)
    session.commit()
    return {"ok": True}
