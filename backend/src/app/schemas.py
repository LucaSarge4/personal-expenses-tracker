from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

from app.models import CategoryKind, ImportStatus


class CategoryCreate(BaseModel):
    name: str
    kind: CategoryKind
    group: str | None = None
    color: str
    llm_hint: str = ""
    exclude_from_totals: bool = False


class CategoryUpdate(BaseModel):
    name: str | None = None
    kind: CategoryKind | None = None
    group: str | None = None
    color: str | None = None
    llm_hint: str | None = None
    exclude_from_totals: bool | None = None
    archived: bool | None = None


class CategoryRead(BaseModel):
    id: int
    name: str
    kind: CategoryKind
    group: str | None
    color: str
    llm_hint: str
    exclude_from_totals: bool
    sort_order: int
    archived: bool


class CategoryOrder(BaseModel):
    ids: list[int]


class CategoryMerge(BaseModel):
    target_id: int


class AccountCreate(BaseModel):
    name: str
    bank: str = ""
    currency: str = "EUR"
    notes: str = ""


class AccountUpdate(BaseModel):
    name: str | None = None
    bank: str | None = None
    currency: str | None = None
    notes: str | None = None


class AccountRead(BaseModel):
    id: int
    name: str
    bank: str
    currency: str
    notes: str


class RuleCreate(BaseModel):
    match_text: str
    category_id: int


class RuleRead(BaseModel):
    id: int
    match_text: str
    category_id: int
    created_from_txn_id: int | None


class ImportRead(BaseModel):
    id: int
    account_id: int
    filename: str
    status: ImportStatus
    progress: int
    model: str
    extracted_count: int
    inserted_count: int
    duplicate_count: int
    low_confidence_count: int
    reconcile_diff_cents: int | None
    error: str | None
    created_at: datetime


class TransactionRead(BaseModel):
    id: int
    account_id: int
    import_id: int | None
    date: date
    description_raw: str
    counterparty: str
    amount_cents: int
    currency: str
    category_id: int | None
    confidence: float | None
    classified_by: str | None
    llm_reason: str
    reviewed: bool
    notes: str


class TransactionUpdate(BaseModel):
    category_id: int | None = None
    notes: str | None = None
    reviewed: bool | None = None


class TransactionBulkUpdate(BaseModel):
    ids: list[int]
    category_id: int | None = None
    reviewed: bool | None = None


class AdminResetRequest(BaseModel):
    transactions: bool = False
    imports: bool = False
    rules: bool = False
    categories: bool = False
    accounts: bool = False


class AdminResetResult(BaseModel):
    transactions_deleted: int
    imports_deleted: int
    rules_deleted: int
    categories_deleted: int
    accounts_deleted: int


class AdviceRequest(BaseModel):
    period: Literal["all", "year", "month"]
    year: int | None = None
    month: int | None = None
    account_id: int | None = None
    question: str | None = None
    locale: str | None = None


class AdviceItem(BaseModel):
    title: str
    detail: str


class AdviceResponse(BaseModel):
    period_label: str
    summary: str
    items: list[AdviceItem]
