from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import Integer, and_, case, func
from sqlmodel import Session, select

from app.db import get_session
from app.models import Category, CategoryKind, Transaction

router = APIRouter(prefix="/api/stats", tags=["stats"])

UNCATEGORIZED_COLOR = "#9ca3af"


def _period_range(year: int, month: int | None) -> tuple[date, date]:
    if month is not None:
        start = date(year, month, 1)
        end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    else:
        start = date(year, 1, 1)
        end = date(year + 1, 1, 1)
    return start, end


def _prev_period(year: int, month: int | None) -> tuple[int, int | None]:
    if month is not None:
        return (year - 1, 12) if month == 1 else (year, month - 1)
    return (year - 1, None)


def _income_expense_totals(
    session: Session, start: date, end: date, account_id: int | None
) -> tuple[int, int]:
    income_case = case(
        (
            and_(Category.kind == CategoryKind.income, Transaction.amount_cents > 0),
            Transaction.amount_cents,
        ),
        else_=0,
    )
    expense_case = case(
        (Category.kind == CategoryKind.expense, Transaction.amount_cents),
        else_=0,
    )
    stmt = (
        select(func.coalesce(func.sum(income_case), 0), func.coalesce(func.sum(expense_case), 0))
        .select_from(Transaction)
        .join(Category, Transaction.category_id == Category.id)
        .where(
            Category.archived == False,  # noqa: E712
            Category.exclude_from_totals == False,  # noqa: E712
            Transaction.date >= start,
            Transaction.date < end,
        )
    )
    if account_id is not None:
        stmt = stmt.where(Transaction.account_id == account_id)
    income, expenses_raw = session.exec(stmt).one()
    return int(income), abs(int(expenses_raw))


def _period_summary(session: Session, year: int, month: int | None, account_id: int | None):
    start, end = _period_range(year, month)
    income, expenses = _income_expense_totals(session, start, end, account_id)
    net = income - expenses
    savings_rate = (net / income) if income else 0.0
    return {"income": income, "expenses": expenses, "net": net, "savings_rate": savings_rate}


@router.get("/summary")
def get_summary(
    year: int,
    month: int | None = None,
    account_id: int | None = None,
    session: Session = Depends(get_session),
) -> dict[str, object]:
    current = _period_summary(session, year, month, account_id)
    prev_year, prev_month = _prev_period(year, month)
    prev = _period_summary(session, prev_year, prev_month, account_id)
    current["prev"] = prev
    return current


@router.get("/monthly")
def get_monthly(
    year: int, account_id: int | None = None, session: Session = Depends(get_session)
) -> list[dict[str, int]]:
    month_expr = func.cast(func.strftime("%m", Transaction.date), Integer)
    income_case = case(
        (
            and_(Category.kind == CategoryKind.income, Transaction.amount_cents > 0),
            Transaction.amount_cents,
        ),
        else_=0,
    )
    expense_case = case(
        (Category.kind == CategoryKind.expense, Transaction.amount_cents),
        else_=0,
    )
    stmt = (
        select(
            month_expr,
            func.coalesce(func.sum(income_case), 0),
            func.coalesce(func.sum(expense_case), 0),
        )
        .select_from(Transaction)
        .join(Category, Transaction.category_id == Category.id)
        .where(
            Category.archived == False,  # noqa: E712
            Category.exclude_from_totals == False,  # noqa: E712
            Transaction.date >= date(year, 1, 1),
            Transaction.date < date(year + 1, 1, 1),
        )
        .group_by(month_expr)
    )
    if account_id is not None:
        stmt = stmt.where(Transaction.account_id == account_id)

    totals = {int(m): (int(inc), abs(int(exp))) for m, inc, exp in session.exec(stmt).all()}
    return [
        {
            "month": m,
            "income": totals.get(m, (0, 0))[0],
            "expenses": totals.get(m, (0, 0))[1],
            "net": totals.get(m, (0, 0))[0] - totals.get(m, (0, 0))[1],
        }
        for m in range(1, 13)
    ]


@router.get("/by-category")
def get_by_category(
    year: int,
    month: int | None = None,
    account_id: int | None = None,
    session: Session = Depends(get_session),
) -> list[dict[str, object]]:
    start, end = _period_range(year, month)

    join_conditions = [
        Transaction.category_id == Category.id,
        Transaction.date >= start,
        Transaction.date < end,
    ]
    if account_id is not None:
        join_conditions.append(Transaction.account_id == account_id)

    stmt = (
        select(
            Category.id,
            Category.name,
            Category.color,
            Category.group,
            Category.kind,
            func.coalesce(func.sum(Transaction.amount_cents), 0),
        )
        .select_from(Category)
        .outerjoin(Transaction, and_(*join_conditions))
        .where(
            Category.archived == False,  # noqa: E712
            Category.exclude_from_totals == False,  # noqa: E712
        )
        .group_by(Category.id)
        .order_by(Category.sort_order)
    )
    rows = [
        {
            "category_id": cid,
            "name": name,
            "color": color,
            "group": group,
            "kind": kind,
            "total": int(total),
        }
        for cid, name, color, group, kind, total in session.exec(stmt).all()
    ]

    uncategorized_stmt = select(func.coalesce(func.sum(Transaction.amount_cents), 0)).where(
        Transaction.category_id.is_(None), Transaction.date >= start, Transaction.date < end
    )
    if account_id is not None:
        uncategorized_stmt = uncategorized_stmt.where(Transaction.account_id == account_id)
    uncategorized_total = int(session.exec(uncategorized_stmt).one())
    if uncategorized_total != 0:
        rows.append(
            {
                "category_id": None,
                "name": "Uncategorized",
                "color": UNCATEGORIZED_COLOR,
                "group": None,
                "kind": None,
                "total": uncategorized_total,
            }
        )
    return rows


def _grid_rows_for_kind(
    session: Session, kind: CategoryKind, year: int, account_id: int | None
) -> list[dict[str, object]]:
    month_expr = func.cast(func.strftime("%m", Transaction.date), Integer)
    join_conditions = [
        Transaction.category_id == Category.id,
        Transaction.date >= date(year, 1, 1),
        Transaction.date < date(year + 1, 1, 1),
    ]
    if account_id is not None:
        join_conditions.append(Transaction.account_id == account_id)

    stmt = (
        select(
            Category.id,
            Category.name,
            Category.color,
            Category.group,
            Category.sort_order,
            month_expr,
            func.coalesce(func.sum(Transaction.amount_cents), 0),
        )
        .select_from(Category)
        .outerjoin(Transaction, and_(*join_conditions))
        .where(
            Category.kind == kind,
            Category.archived == False,  # noqa: E712
            Category.exclude_from_totals == False,  # noqa: E712
        )
        .group_by(Category.id, month_expr)
        .order_by(Category.sort_order)
    )

    rows_by_id: dict[int, dict[str, object]] = {}
    order: list[int] = []
    for cid, name, color, group, _sort_order, month, total in session.exec(stmt).all():
        if cid not in rows_by_id:
            rows_by_id[cid] = {
                "category_id": cid,
                "name": name,
                "color": color,
                "group": group,
                "months": [0] * 12,
                "total": 0,
            }
            order.append(cid)
        if month is not None:
            idx = int(month) - 1
            rows_by_id[cid]["months"][idx] = int(total)
            rows_by_id[cid]["total"] += int(total)
    return [rows_by_id[cid] for cid in order]


def _group_subtotals(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    subtotals: dict[str, dict[str, object]] = {}
    for row in rows:
        group = row["group"]
        if group is None:
            continue
        if group not in subtotals:
            subtotals[group] = {"group": group, "months": [0] * 12, "total": 0}
        for i in range(12):
            subtotals[group]["months"][i] += row["months"][i]
        subtotals[group]["total"] += row["total"]
    return list(subtotals.values())


@router.get("/grid")
def get_grid(
    year: int, account_id: int | None = None, session: Session = Depends(get_session)
) -> dict[str, object]:
    income_rows = _grid_rows_for_kind(session, CategoryKind.income, year, account_id)
    expense_rows = _grid_rows_for_kind(session, CategoryKind.expense, year, account_id)

    month_totals = [0] * 12
    for row in income_rows + expense_rows:
        for i in range(12):
            month_totals[i] += row["months"][i]

    return {
        "income_rows": income_rows,
        "expense_rows": expense_rows,
        "group_subtotals": _group_subtotals(income_rows) + _group_subtotals(expense_rows),
        "month_totals": month_totals,
        "year_total": sum(month_totals),
    }
