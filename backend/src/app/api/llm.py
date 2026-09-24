import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Integer, and_, case, func
from sqlmodel import Session, select

from app.db import get_session
from app.i18n import get_locale, resolve_locale
from app.llm.client import LLMError, chat_json, list_models, timed_test_call
from app.models import Category, CategoryKind, Transaction
from app.schemas import AdviceItem, AdviceRequest, AdviceResponse

router = APIRouter(prefix="/api/llm", tags=["llm"])

MONTH_NAMES: dict[str, list[str]] = {
    "en": [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ],
    "it": [
        "Gennaio",
        "Febbraio",
        "Marzo",
        "Aprile",
        "Maggio",
        "Giugno",
        "Luglio",
        "Agosto",
        "Settembre",
        "Ottobre",
        "Novembre",
        "Dicembre",
    ],
}

ALL_TIME_LABEL: dict[str, str] = {"en": "All time", "it": "Tutto lo storico"}

NO_TRANSACTIONS_ERROR: dict[str, str] = {
    "en": "No transactions in the selected period",
    "it": "Nessuna transazione nel periodo selezionato",
}

ADVICE_SYSTEM_PROMPTS: dict[str, str] = {
    "en": (
        "You are a personal financial advisor analyzing a user's spending. You receive a "
        "numeric summary (income, expenses, categories, an optional monthly or yearly trend) "
        "for a specific period. Based ONLY on the data given, without inventing numbers or "
        "categories that aren't present, write: a short summary (2-3 sentences) of the "
        "situation, and a list of 3-6 practical, specific, concrete tips (e.g. spending "
        "categories to watch, savings rate trend, uncategorized transactions that reduce the "
        "analysis's reliability). Always answer in English, with a direct tone."
    ),
    "it": (
        "Sei un consulente finanziario personale che analizza le spese di un utente italiano. "
        "Ricevi un riepilogo numerico (entrate, uscite, categorie, eventuale andamento mensile "
        "o annuale) relativo a un periodo specifico. Basandoti SOLO sui dati forniti, senza "
        "inventare numeri o categorie non presenti, scrivi: un breve riassunto (2-3 frasi) "
        "della situazione, e una lista di 3-6 consigli pratici, specifici e concreti (es. "
        "categorie di spesa su cui intervenire, andamento del tasso di risparmio, transazioni "
        "non categorizzate che riducono l'affidabilità dell'analisi). Rispondi sempre in "
        "italiano, con un tono diretto."
    ),
}

QUESTION_SYSTEM_PROMPTS: dict[str, str] = {
    "en": (
        "You are a personal financial advisor answering a specific question a user asked about "
        "their own finances. You receive the question ('user_question') and a numeric summary "
        "(income, expenses, categories, an optional monthly or yearly trend) for the given "
        "period. Based ONLY on the data given, without inventing numbers or categories that "
        "aren't present: in the 'summary' field answer the question directly and decisively "
        "(e.g. starting with 'Yes,' or 'No,' for a yes/no question like 'can I afford this "
        "expense?'), explaining the reasoning in 2-4 sentences with concrete numbers from the "
        "data. In the 'items' field list 2-5 supporting considerations (e.g. impact on savings "
        "rate, categories already above average, alternatives). If the given data isn't enough "
        "to answer confidently, say so explicitly instead of guessing. Always answer in English."
    ),
    "it": (
        "Sei un consulente finanziario personale che risponde a una domanda specifica di un "
        "utente italiano sulla propria situazione economica. Ricevi la domanda "
        "('user_question') e un riepilogo numerico (entrate, uscite, categorie, eventuale "
        "andamento mensile o annuale) relativo al periodo indicato. Basandoti SOLO sui dati "
        "forniti, senza inventare numeri o categorie non presenti: nel campo 'summary' "
        "rispondi in modo diretto e netto alla domanda (es. iniziando con 'Sì,' o 'No,' se la "
        "domanda è un sì/no, tipo 'posso permettermi questa spesa?'), spiegando il "
        "ragionamento in 2-4 frasi con numeri concreti presi dai dati. Nel campo 'items' "
        "elenca 2-5 considerazioni di supporto (es. impatto sul tasso di risparmio, categorie "
        "già sopra la media, alternative). Se i dati forniti non bastano a rispondere con "
        "sicurezza, dillo esplicitamente invece di indovinare. Rispondi sempre in italiano."
    ),
}


@router.get("/models")
def get_models() -> list[str]:
    return list_models()


@router.post("/test")
def test_connection() -> dict[str, object]:
    return timed_test_call()


class _AdviceLLMSchema(BaseModel):
    summary: str
    items: list[AdviceItem]


def _date_bounds(
    period: str, year: int | None, month: int | None
) -> tuple[date | None, date | None]:
    if period == "month":
        if year is None or month is None:
            raise HTTPException(400, "year and month are required for period=month")
        start = date(year, month, 1)
        end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        return start, end
    if period == "year":
        if year is None:
            raise HTTPException(400, "year is required for period=year")
        return date(year, 1, 1), date(year + 1, 1, 1)
    return None, None


def _period_label(period: str, year: int | None, month: int | None, locale: str) -> str:
    if period == "month":
        return f"{MONTH_NAMES[locale][(month or 1) - 1]} {year}"
    if period == "year":
        return str(year)
    return ALL_TIME_LABEL[locale]


def _to_euro(cents: int) -> float:
    return round(cents / 100, 2)


def _category_breakdown(
    session: Session, start: date | None, end: date | None, account_id: int | None
) -> tuple[int, int, list[dict], list[dict]]:
    join_conditions = [Transaction.category_id == Category.id]
    if start is not None and end is not None:
        join_conditions += [Transaction.date >= start, Transaction.date < end]
    if account_id is not None:
        join_conditions.append(Transaction.account_id == account_id)

    stmt = (
        select(Category.name, Category.kind, func.coalesce(func.sum(Transaction.amount_cents), 0))
        .select_from(Category)
        .outerjoin(Transaction, and_(*join_conditions))
        .where(
            Category.archived == False,  # noqa: E712
            Category.exclude_from_totals == False,  # noqa: E712
        )
        .group_by(Category.id)
    )
    rows = session.exec(stmt).all()

    income = sum(int(t) for _n, k, t in rows if k == CategoryKind.income and t > 0)
    expenses = sum(abs(int(t)) for _n, k, t in rows if k == CategoryKind.expense and t != 0)

    expense_categories = sorted(
        (
            {"name": n, "total_eur": _to_euro(abs(int(t)))}
            for n, k, t in rows
            if k == CategoryKind.expense and t != 0
        ),
        key=lambda r: r["total_eur"],
        reverse=True,
    )
    income_categories = sorted(
        (
            {"name": n, "total_eur": _to_euro(int(t))}
            for n, k, t in rows
            if k == CategoryKind.income and t > 0
        ),
        key=lambda r: r["total_eur"],
        reverse=True,
    )
    return int(income), int(expenses), expense_categories, income_categories


def _quality_counts(
    session: Session, start: date | None, end: date | None, account_id: int | None
) -> tuple[int, int]:
    conditions = []
    if start is not None and end is not None:
        conditions += [Transaction.date >= start, Transaction.date < end]
    if account_id is not None:
        conditions.append(Transaction.account_id == account_id)

    uncategorized = session.exec(
        select(func.count())
        .select_from(Transaction)
        .where(Transaction.category_id.is_(None), *conditions)
    ).one()
    unreviewed = session.exec(
        select(func.count())
        .select_from(Transaction)
        .where(Transaction.reviewed == False, *conditions)  # noqa: E712
    ).one()
    return int(uncategorized), int(unreviewed)


def _trend(
    session: Session, period: str, year: int | None, account_id: int | None, locale: str
) -> list[dict] | None:
    """Monthly trend within a year, or yearly trend across all history — skipped
    for a single-month period, where a sub-period breakdown isn't meaningful."""
    if period == "month":
        return None

    income_case = func.sum(
        case(
            (
                and_(Category.kind == CategoryKind.income, Transaction.amount_cents > 0),
                Transaction.amount_cents,
            ),
            else_=0,
        )
    )
    expense_case = func.sum(
        case((Category.kind == CategoryKind.expense, Transaction.amount_cents), else_=0)
    )

    if period == "year":
        bucket_expr = func.cast(func.strftime("%m", Transaction.date), Integer)
        stmt = (
            select(bucket_expr, income_case, expense_case)
            .select_from(Transaction)
            .join(Category, Transaction.category_id == Category.id)
            .where(
                Category.archived == False,  # noqa: E712
                Category.exclude_from_totals == False,  # noqa: E712
                Transaction.date >= date(year, 1, 1),
                Transaction.date < date(year + 1, 1, 1),
            )
            .group_by(bucket_expr)
        )
        if account_id is not None:
            stmt = stmt.where(Transaction.account_id == account_id)
        rows = session.exec(stmt).all()
        return [
            {
                "label": MONTH_NAMES[locale][int(bucket) - 1],
                "income_eur": _to_euro(int(inc)),
                "expenses_eur": _to_euro(abs(int(exp))),
            }
            for bucket, inc, exp in sorted(rows, key=lambda r: r[0])
        ]

    # period == "all": one bucket per calendar year
    bucket_expr = func.strftime("%Y", Transaction.date)
    stmt = (
        select(bucket_expr, income_case, expense_case)
        .select_from(Transaction)
        .join(Category, Transaction.category_id == Category.id)
        .where(
            Category.archived == False,  # noqa: E712
            Category.exclude_from_totals == False,  # noqa: E712
        )
        .group_by(bucket_expr)
    )
    if account_id is not None:
        stmt = stmt.where(Transaction.account_id == account_id)
    rows = session.exec(stmt).all()
    if len(rows) < 2:
        return None
    return [
        {"label": bucket, "income_eur": _to_euro(int(inc)), "expenses_eur": _to_euro(abs(int(exp)))}
        for bucket, inc, exp in sorted(rows, key=lambda r: r[0])
    ]


@router.post("/advice")
def get_advice(payload: AdviceRequest, session: Session = Depends(get_session)) -> AdviceResponse:
    locale = resolve_locale(payload.locale) if payload.locale else get_locale(session)

    start, end = _date_bounds(payload.period, payload.year, payload.month)
    period_label = _period_label(payload.period, payload.year, payload.month, locale)

    income, expenses, expense_categories, income_categories = _category_breakdown(
        session, start, end, payload.account_id
    )
    uncategorized_count, unreviewed_count = _quality_counts(session, start, end, payload.account_id)
    trend = _trend(session, payload.period, payload.year, payload.account_id, locale)

    if income == 0 and expenses == 0:
        raise HTTPException(400, NO_TRANSACTIONS_ERROR[locale])

    net = income - expenses
    prompt_payload: dict[str, object] = {
        "period": period_label,
        "income_eur": _to_euro(income),
        "expenses_eur": _to_euro(expenses),
        "net_eur": _to_euro(net),
        "savings_rate": round(net / income, 3) if income else None,
        "expense_categories": expense_categories,
        "income_categories": income_categories,
        "uncategorized_transactions": uncategorized_count,
        "unreviewed_transactions": unreviewed_count,
    }
    if trend:
        prompt_payload["trend"] = trend

    question = (payload.question or "").strip()
    if question:
        prompt_payload["user_question"] = question

    try:
        result = chat_json(
            system=(QUESTION_SYSTEM_PROMPTS[locale] if question else ADVICE_SYSTEM_PROMPTS[locale]),
            user=json.dumps(prompt_payload, ensure_ascii=False),
            schema=_AdviceLLMSchema,
        )
    except LLMError as exc:
        raise HTTPException(502, f"LLM call failed: {exc}") from exc

    return AdviceResponse(period_label=period_label, summary=result.summary, items=result.items)
