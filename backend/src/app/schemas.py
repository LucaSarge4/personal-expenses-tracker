import datetime as dt
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

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


def _require_description(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("description must not be empty")
    return value


def _require_nonzero(value: int) -> int:
    if value == 0:
        raise ValueError("amount must not be zero")
    return value


class TransactionCreate(BaseModel):
    account_id: int
    date: date
    description_raw: str
    amount_cents: int
    category_id: int | None = None
    notes: str = ""

    _description = field_validator("description_raw")(_require_description)
    _amount = field_validator("amount_cents")(_require_nonzero)


class TransactionBatchCreate(BaseModel):
    items: list[TransactionCreate] = Field(min_length=1, max_length=500)


class TransactionUpdate(BaseModel):
    category_id: int | None = None
    notes: str | None = None
    reviewed: bool | None = None
    # `dt.date`: the field name shadows `date` inside the class body.
    date: dt.date | None = None
    description_raw: str | None = None
    amount_cents: int | None = None
    account_id: int | None = None

    @field_validator("description_raw")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return None if value is None else _require_description(value)

    @field_validator("amount_cents")
    @classmethod
    def _amount(cls, value: int | None) -> int | None:
        return None if value is None else _require_nonzero(value)


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
