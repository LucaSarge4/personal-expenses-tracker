from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import Category, Rule, Transaction
from app.schemas import CategoryCreate, CategoryMerge, CategoryOrder, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryRead])
def list_categories(
    include_archived: bool = False, session: Session = Depends(get_session)
) -> list[Category]:
    statement = select(Category).order_by(Category.sort_order)
    if not include_archived:
        statement = statement.where(Category.archived == False)  # noqa: E712
    return list(session.exec(statement).all())


@router.post("", response_model=CategoryRead)
def create_category(payload: CategoryCreate, session: Session = Depends(get_session)) -> Category:
    max_sort_order = session.exec(
        select(Category.sort_order).order_by(Category.sort_order.desc())
    ).first()
    category = Category(
        **payload.model_dump(),
        sort_order=(max_sort_order + 1) if max_sort_order is not None else 0,
    )
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.patch("/{category_id}", response_model=CategoryRead)
def update_category(
    category_id: int, payload: CategoryUpdate, session: Session = Depends(get_session)
) -> Category:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.put("/order")
def reorder_categories(
    payload: CategoryOrder, session: Session = Depends(get_session)
) -> dict[str, bool]:
    for sort_order, category_id in enumerate(payload.ids):
        category = session.get(Category, category_id)
        if category is None:
            raise HTTPException(status_code=404, detail=f"Category {category_id} not found")
        category.sort_order = sort_order
        session.add(category)
    session.commit()
    return {"ok": True}


@router.post("/{category_id}/archive", response_model=CategoryRead)
def archive_category(category_id: int, session: Session = Depends(get_session)) -> Category:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    category.archived = True
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@router.post("/{category_id}/merge", response_model=CategoryRead)
def merge_category(
    category_id: int, payload: CategoryMerge, session: Session = Depends(get_session)
) -> Category:
    if category_id == payload.target_id:
        raise HTTPException(status_code=400, detail="Cannot merge a category into itself")
    source = session.get(Category, category_id)
    target = session.get(Category, payload.target_id)
    if source is None or target is None:
        raise HTTPException(status_code=404, detail="Category not found")

    for txn in session.exec(
        select(Transaction).where(Transaction.category_id == category_id)
    ).all():
        txn.category_id = payload.target_id
        session.add(txn)
    for rule in session.exec(select(Rule).where(Rule.category_id == category_id)).all():
        rule.category_id = payload.target_id
        session.add(rule)

    session.delete(source)
    session.commit()
    session.refresh(target)
    return target


@router.delete("/{category_id}")
def delete_category(category_id: int, session: Session = Depends(get_session)) -> dict[str, bool]:
    category = session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    in_use = session.exec(select(Transaction).where(Transaction.category_id == category_id)).first()
    if in_use is not None:
        raise HTTPException(status_code=409, detail="Category is in use by transactions")

    session.delete(category)
    session.commit()
    return {"ok": True}
