import re
from collections.abc import Callable
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.i18n import resolve_locale
from app.llm.client import chat_json

EXTRACT_SYSTEM_PROMPTS: dict[str, str] = {
    "it": """\
You extract transactions from Italian bank statement text (PDF/CSV/XLSX \
converted to text or markdown tables).

Conventions:
- Dates are dd/mm/yyyy.
- Source amounts use Italian formatting: thousands separator "." and decimal \
separator ",", e.g. "1.234,56" means 1234.56.
- "Dare" or "Uscite" columns are outflows: represent them as NEGATIVE amounts.
- "Avere" or "Entrate" columns are inflows: represent them as POSITIVE amounts.
- Skip balance lines ("saldo iniziale", "saldo finale"), running totals, \
column headers, and blank/separator rows.
- Keep the description verbatim, do not translate or summarize it.
- Never invent transactions that are not present in the text.
- If the statement states an opening and/or closing balance, report them in \
opening_balance / closing_balance (signed, as printed). Otherwise leave them null.
- IMPORTANT: in your JSON output, write every amount (amount, opening_balance, \
closing_balance) as a plain decimal number using a "." as the decimal point \
and no thousands separator, e.g. 1234.56 (not "1.234,56" and not "1234,56").
- IMPORTANT: in your JSON output, write every date in ISO 8601 "yyyy-mm-dd" \
format, converting from the source's dd/mm/yyyy. For example, a source date \
of 25/03/2026 (25 March 2026) must be written as "2026-03-25". Never output \
the source's dd/mm/yyyy format directly.
""",
    "en": """\
You extract transactions from bank statement text (PDF/CSV/XLSX converted to \
text or markdown tables).

Conventions:
- Dates may be printed as dd/mm/yyyy, mm/dd/yyyy, or yyyy-mm-dd; infer which \
from context (day-of-month > 12 disambiguates it) and convert accordingly.
- Source amounts may use either "," or "." as the decimal separator, with the \
other character as the thousands separator (e.g. "1,234.56" or "1.234,56" \
both mean 1234.56) — infer which from context.
- "Debit"/"Withdrawal"/"Out" columns are outflows: represent them as NEGATIVE \
amounts. "Credit"/"Deposit"/"In" columns are inflows: represent them as \
POSITIVE amounts.
- Skip balance lines ("opening balance", "closing balance", "balance brought \
forward", "balance carried forward"), running totals, column headers, and \
blank/separator rows.
- Keep the description verbatim, do not translate or summarize it.
- Never invent transactions that are not present in the text.
- If the statement states an opening and/or closing balance, report them in \
opening_balance / closing_balance (signed, as printed). Otherwise leave them null.
- IMPORTANT: in your JSON output, write every amount (amount, opening_balance, \
closing_balance) as a plain decimal number using a "." as the decimal point \
and no thousands separator, e.g. 1234.56 (not "1,234.56").
- IMPORTANT: in your JSON output, write every date in ISO 8601 "yyyy-mm-dd" \
format. Never output the source's original date format directly.
""",
}

_ITALIAN_DECIMAL_RE = re.compile(r"^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+,\d+$")


def _coerce_amount(value: object) -> object:
    """Tolerate the LLM emitting comma-decimal strings anyway, regardless of
    locale (a plain "." decimal value is left untouched either way)."""
    if not isinstance(value, str):
        return value
    text = value.strip()
    if "," in text and _ITALIAN_DECIMAL_RE.match(text):
        text = text.replace(".", "").replace(",", ".")
    return text


_DD_MM_YYYY_RE = re.compile(r"^(\d{2})[/-](\d{2})[/-](\d{4})$")


def _coerce_date(value: object) -> object:
    """Tolerate the LLM emitting the source's dd/mm/yyyy format anyway."""
    if not isinstance(value, str):
        return value
    match = _DD_MM_YYYY_RE.match(value.strip())
    if match:
        day, month, year = match.groups()
        return f"{year}-{month}-{day}"
    return value


class ExtractedTxn(BaseModel):
    date: date
    description: str
    amount: Decimal
    currency: str = "EUR"

    @field_validator("date", mode="before")
    @classmethod
    def _normalize_date(cls, value: object) -> object:
        return _coerce_date(value)

    @field_validator("amount", mode="before")
    @classmethod
    def _normalize_amount(cls, value: object) -> object:
        return _coerce_amount(value)


class ExtractionResult(BaseModel):
    transactions: list[ExtractedTxn]
    opening_balance: Decimal | None = None
    closing_balance: Decimal | None = None

    @field_validator("opening_balance", "closing_balance", mode="before")
    @classmethod
    def _normalize_balance(cls, value: object) -> object:
        return _coerce_amount(value)


def _extract_chunk(chunk: str, locale: str) -> ExtractionResult:
    return chat_json(
        system=EXTRACT_SYSTEM_PROMPTS[resolve_locale(locale)],
        user=f"Extract all transactions from this statement excerpt:\n\n{chunk}",
        schema=ExtractionResult,
    )


def extract_transactions(
    chunks: list[str],
    locale: str = "en",
    on_chunk_done: Callable[[int, int], None] | None = None,
) -> ExtractionResult:
    all_transactions: list[ExtractedTxn] = []
    opening_balance: Decimal | None = None
    closing_balance: Decimal | None = None

    for i, chunk in enumerate(chunks, start=1):
        result = _extract_chunk(chunk, locale)
        all_transactions.extend(result.transactions)
        if opening_balance is None and result.opening_balance is not None:
            opening_balance = result.opening_balance
        if result.closing_balance is not None:
            closing_balance = result.closing_balance
        if on_chunk_done is not None:
            on_chunk_done(i, len(chunks))

    return ExtractionResult(
        transactions=all_transactions,
        opening_balance=opening_balance,
        closing_balance=closing_balance,
    )


def reconcile(result: ExtractionResult) -> Decimal | None:
    if result.opening_balance is None or result.closing_balance is None:
        return None
    expected_closing = result.opening_balance + sum(
        (t.amount for t in result.transactions), Decimal(0)
    )
    return result.closing_balance - expected_closing
