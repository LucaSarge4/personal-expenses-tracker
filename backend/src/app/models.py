import datetime as dt
from enum import StrEnum

from sqlmodel import Field, SQLModel


class CategoryKind(StrEnum):
    income = "income"
    expense = "expense"
    transfer = "transfer"


class ImportStatus(StrEnum):
    queued = "queued"
    extracting = "extracting"
    classifying = "classifying"
    review = "review"
    done = "done"
    error = "error"


class ClassifiedBy(StrEnum):
    rule = "rule"
    llm = "llm"
    user = "user"


class Category(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    kind: CategoryKind
    group: str | None = None
    color: str
    llm_hint: str = ""
    exclude_from_totals: bool = False
    sort_order: int = 0
    archived: bool = False


class Account(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    bank: str = ""
    currency: str = "EUR"
    notes: str = ""


class StatementImport(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True)
    filename: str
    stored_path: str
    sha256: str = Field(unique=True, index=True)
    status: ImportStatus = ImportStatus.queued
    progress: int = 0
    model: str = ""
    extracted_count: int = 0
    inserted_count: int = 0
    duplicate_count: int = 0
    low_confidence_count: int = 0
    reconcile_diff_cents: int | None = None
    error: str | None = None
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.UTC))


class Transaction(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="account.id", index=True)
    import_id: int | None = Field(default=None, foreign_key="statementimport.id", index=True)
    date: dt.date = Field(index=True)
    description_raw: str
    counterparty: str = ""
    amount_cents: int
    currency: str = "EUR"
    category_id: int | None = Field(default=None, foreign_key="category.id", index=True)
    confidence: float | None = None
    classified_by: ClassifiedBy | None = None
    llm_reason: str = ""
    reviewed: bool = False
    dedupe_hash: str = Field(unique=True, index=True)
    notes: str = ""


class Rule(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    match_text: str = Field(index=True)
    category_id: int = Field(foreign_key="category.id", index=True)
    created_from_txn_id: int | None = Field(default=None, foreign_key="transaction.id")


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str
