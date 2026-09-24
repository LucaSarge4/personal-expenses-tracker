"""Generate a fully synthetic demo dataset (accounts + transactions).

Run via `make demo-data`. Writes to whatever DATA_DIR is set to (the
Makefile target points it at ../data-dist) -- never at a real data/
directory. Every account, description, and amount below is fabricated;
none of it is derived from the maintainer's own bank data.
"""

import hashlib
import random
from datetime import date

from sqlmodel import Session, select

from app.ingest.dedupe import dedupe_hash, normalize
from app.models import Account, Category, Transaction
from app.seed import seed_all

RNG_SEED = 42

# (description, category name, min_cents, max_cents) - all fictional.
EXPENSE_TEMPLATES = [
    ("Rent Payment", "Rent/Mortgage", 95000, 95000),
    ("City Power & Gas", "Utilities", 4500, 9500),
    ("Fresh Market Grocery", "Groceries", 2500, 9000),
    ("Home Depot Supplies", "Home Expenses", 1500, 6000),
    ("Dr. Patel Clinic", "Health", 2000, 12000),
    ("HealthGuard Insurance", "Insurance", 6500, 6500),
    ("Metro Transit Pass", "Transport", 5000, 5000),
    ("Rideshare Trip", "Transport", 800, 2500),
    ("Trattoria Bella", "Dining Out", 1500, 6500),
    ("Coffee Corner", "Dining Out", 350, 800),
    ("Online Retailer Order", "Shopping", 1200, 9000),
    ("Sportswear Store", "Shopping", 3000, 12000),
    ("FitZone Gym", "Fitness", 3900, 3900),
    ("StreamPlus Subscription", "Subscriptions", 1299, 1299),
    ("MusicWave Subscription", "Subscriptions", 999, 999),
    ("Weekend Getaway Hotel", "Travel", 8000, 25000),
    ("Cinema Tickets", "Entertainment", 1600, 3200),
    ("Board Game Cafe", "Entertainment", 2000, 4500),
    ("Annual Tax Payment", "Taxes", 12000, 40000),
]

INCOME_TEMPLATES = [
    ("Employer Payroll", "Salary", 280000, 320000),
    ("Consulting Invoice", "Freelance/Business", 20000, 60000),
    ("Brokerage Dividend", "Interest/Dividends", 1500, 8000),
]

TRANSFER_TEMPLATES = [
    ("Transfer to Savings", "Transfer", 20000, 50000),
]

ACCOUNTS = [
    {"name": "Demo Checking", "bank": "Demo Bank", "currency": "EUR"},
    {"name": "Demo Savings", "bank": "Demo Bank", "currency": "EUR"},
]

MONTHS_BACK = 11


def _stable_dedupe_hash(account_id: int, txn_date: date, amount_cents: int, desc: str) -> str:
    normalized_desc = normalize(desc)
    occurrence_idx = int(
        hashlib.sha256(f"{account_id}|{txn_date}|{desc}".encode()).hexdigest()[:6], 16
    )
    return dedupe_hash(account_id, txn_date, amount_cents, normalized_desc, occurrence_idx)


def generate_transactions(session: Session, rng: random.Random) -> None:
    accounts: dict[str, Account] = {}
    for spec in ACCOUNTS:
        acct = Account(**spec)
        session.add(acct)
        accounts[spec["name"]] = acct
    session.commit()
    for acct in accounts.values():
        session.refresh(acct)

    categories = {c.name: c for c in session.exec(select(Category)).all()}

    checking = accounts["Demo Checking"]
    savings = accounts["Demo Savings"]

    today = date.today()
    start_month = (today.year, today.month)

    for months_ago in range(MONTHS_BACK, -1, -1):
        month_idx = start_month[1] - months_ago
        year = start_month[0]
        while month_idx <= 0:
            month_idx += 12
            year -= 1

        is_current_month = months_ago == 0
        max_day = today.day if is_current_month else 28

        # Income, once a month.
        for desc, cat_name, lo, hi in INCOME_TEMPLATES:
            if cat_name == "Freelance/Business" and rng.random() < 0.5:
                continue
            day = rng.randint(1, min(5, max_day))
            txn_date = date(year, month_idx, day)
            amount = rng.randint(lo, hi)
            _add_txn(session, checking, categories[cat_name], txn_date, amount, desc)

        # Recurring expenses, most months.
        for desc, cat_name, lo, hi in EXPENSE_TEMPLATES:
            occurrences = 1 if rng.random() < 0.75 else rng.randint(0, 2)
            for _ in range(occurrences):
                day = rng.randint(1, max_day)
                txn_date = date(year, month_idx, day)
                amount = rng.randint(lo, hi)
                _add_txn(session, checking, categories[cat_name], txn_date, -amount, desc)

        # A savings transfer most months (excluded from totals on both sides).
        if rng.random() < 0.7 and max_day >= 20:
            desc, cat_name, lo, hi = TRANSFER_TEMPLATES[0]
            day = rng.randint(20, max_day)
            txn_date = date(year, month_idx, day)
            amount = rng.randint(lo, hi)
            _add_txn(session, checking, categories[cat_name], txn_date, -amount, desc)
            _add_txn(session, savings, categories[cat_name], txn_date, amount, desc)

    session.commit()


def _add_txn(
    session: Session,
    account: Account,
    category: Category,
    txn_date: date,
    amount_cents: int,
    desc: str,
) -> None:
    dh = _stable_dedupe_hash(account.id, txn_date, amount_cents, desc)
    session.add(
        Transaction(
            account_id=account.id,
            date=txn_date,
            description_raw=desc,
            amount_cents=amount_cents,
            category_id=category.id,
            confidence=1.0,
            classified_by="rule",
            reviewed=True,
            dedupe_hash=dh,
        )
    )


def main() -> None:
    from app.db import engine
    from app.main import run_migrations

    run_migrations()
    rng = random.Random(RNG_SEED)
    with Session(engine) as session:
        if session.exec(select(Account)).first() is not None:
            print("Demo data already present, skipping.")
            return
        seed_all(session)
        generate_transactions(session, rng)
    print("Demo data generated.")


if __name__ == "__main__":
    main()
