from datetime import date

import pytest
from sqlmodel import Session

from app.db import engine
from app.models import Transaction

YEAR = 2030


@pytest.fixture(scope="module")
def ctx(client) -> dict:
    return _setup(client)


def _setup(client) -> dict:
    account = client.post("/api/accounts", json={"name": "Stats Test Account"}).json()
    salary = client.post(
        "/api/categories", json={"name": "Stats Salary", "kind": "income", "color": "#111111"}
    ).json()
    groceries = client.post(
        "/api/categories",
        json={
            "name": "Stats Groceries",
            "kind": "expense",
            "group": "Stats Casa",
            "color": "#222222",
        },
    ).json()
    rent = client.post(
        "/api/categories",
        json={"name": "Stats Rent", "kind": "expense", "group": "Stats Casa", "color": "#333333"},
    ).json()
    transfer = client.post(
        "/api/categories",
        json={
            "name": "Stats Giroconto",
            "kind": "transfer",
            "color": "#444444",
            "exclude_from_totals": True,
        },
    ).json()

    with Session(engine) as session:
        session.add_all(
            [
                # January: income 2000.00, groceries -100.00, rent -800.00
                Transaction(
                    account_id=account["id"],
                    date=date(YEAR, 1, 5),
                    description_raw="Salary Jan",
                    amount_cents=200000,
                    category_id=salary["id"],
                    dedupe_hash="stats-1",
                ),
                Transaction(
                    account_id=account["id"],
                    date=date(YEAR, 1, 10),
                    description_raw="Groceries Jan",
                    amount_cents=-10000,
                    category_id=groceries["id"],
                    dedupe_hash="stats-2",
                ),
                Transaction(
                    account_id=account["id"],
                    date=date(YEAR, 1, 15),
                    description_raw="Rent Jan",
                    amount_cents=-80000,
                    category_id=rent["id"],
                    dedupe_hash="stats-3",
                ),
                # A transfer, must be excluded entirely from totals.
                Transaction(
                    account_id=account["id"],
                    date=date(YEAR, 1, 20),
                    description_raw="To savings",
                    amount_cents=-50000,
                    category_id=transfer["id"],
                    dedupe_hash="stats-4",
                ),
                # Uncategorized transaction: shows in by-category but not in
                # income/expenses totals (per the literal spec: income/expenses
                # are sums scoped to income/expense *categories*).
                Transaction(
                    account_id=account["id"],
                    date=date(YEAR, 1, 25),
                    description_raw="Mystery",
                    amount_cents=-2500,
                    category_id=None,
                    dedupe_hash="stats-5",
                ),
                # February: income 2100.00, groceries -120.00
                Transaction(
                    account_id=account["id"],
                    date=date(YEAR, 2, 5),
                    description_raw="Salary Feb",
                    amount_cents=210000,
                    category_id=salary["id"],
                    dedupe_hash="stats-6",
                ),
                Transaction(
                    account_id=account["id"],
                    date=date(YEAR, 2, 10),
                    description_raw="Groceries Feb",
                    amount_cents=-12000,
                    category_id=groceries["id"],
                    dedupe_hash="stats-7",
                ),
                # Previous year (December YEAR-1): income 1000.00
                Transaction(
                    account_id=account["id"],
                    date=date(YEAR - 1, 12, 20),
                    description_raw="Salary prev Dec",
                    amount_cents=100000,
                    category_id=salary["id"],
                    dedupe_hash="stats-8",
                ),
            ]
        )
        session.commit()

    return {
        "account": account,
        "salary": salary,
        "groceries": groceries,
        "rent": rent,
        "transfer": transfer,
    }


def test_summary_month_totals_and_transfer_exclusion(client, ctx) -> None:
    account_id = ctx["account"]["id"]

    response = client.get(
        "/api/stats/summary", params={"year": YEAR, "month": 1, "account_id": account_id}
    )
    assert response.status_code == 200
    data = response.json()

    assert data["income"] == 200000
    assert data["expenses"] == 90000  # groceries 100 + rent 800, transfer excluded
    assert data["net"] == 110000
    assert data["savings_rate"] == 110000 / 200000

    # Previous period for month=1 is December of the previous year.
    assert data["prev"]["income"] == 100000
    assert data["prev"]["expenses"] == 0
    assert data["prev"]["net"] == 100000


def test_summary_year_level_prev_is_previous_year(client, ctx) -> None:
    account_id = ctx["account"]["id"]

    response = client.get("/api/stats/summary", params={"year": YEAR, "account_id": account_id})
    data = response.json()
    assert data["income"] == 410000  # Jan 2000 + Feb 2100
    assert data["expenses"] == 102000  # 900 (Jan) + 120 (Feb)
    assert data["prev"]["income"] == 100000  # all of YEAR-1 (just the Dec txn)


def test_monthly_breaks_down_by_month(client, ctx) -> None:
    account_id = ctx["account"]["id"]

    response = client.get("/api/stats/monthly", params={"year": YEAR, "account_id": account_id})
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 12

    jan = next(r for r in rows if r["month"] == 1)
    assert jan == {"month": 1, "income": 200000, "expenses": 90000, "net": 110000}

    feb = next(r for r in rows if r["month"] == 2)
    assert feb == {"month": 2, "income": 210000, "expenses": 12000, "net": 198000}

    march = next(r for r in rows if r["month"] == 3)
    assert march == {"month": 3, "income": 0, "expenses": 0, "net": 0}


def test_by_category_totals_and_uncategorized_bucket(client, ctx) -> None:
    account_id = ctx["account"]["id"]

    response = client.get(
        "/api/stats/by-category", params={"year": YEAR, "month": 1, "account_id": account_id}
    )
    assert response.status_code == 200
    rows = {r["name"]: r for r in response.json()}

    assert rows["Stats Salary"]["total"] == 200000
    assert rows["Stats Groceries"]["total"] == -10000
    assert rows["Stats Rent"]["total"] == -80000
    assert "Stats Giroconto" not in rows  # exclude_from_totals categories are hidden
    assert rows["Uncategorized"]["total"] == -2500
    assert rows["Uncategorized"]["category_id"] is None


def test_grid_rows_groups_and_totals(client, ctx) -> None:
    account_id = ctx["account"]["id"]

    response = client.get("/api/stats/grid", params={"year": YEAR, "account_id": account_id})
    assert response.status_code == 200
    data = response.json()

    income_row = next(r for r in data["income_rows"] if r["name"] == "Stats Salary")
    assert income_row["months"][0] == 200000
    assert income_row["months"][1] == 210000
    assert income_row["total"] == 410000

    groceries_row = next(r for r in data["expense_rows"] if r["name"] == "Stats Groceries")
    assert groceries_row["months"][0] == -10000
    assert groceries_row["months"][1] == -12000
    assert groceries_row["group"] == "Stats Casa"

    rent_row = next(r for r in data["expense_rows"] if r["name"] == "Stats Rent")
    assert rent_row["months"][0] == -80000

    casa_subtotal = next(g for g in data["group_subtotals"] if g["group"] == "Stats Casa")
    assert casa_subtotal["months"][0] == -90000
    assert casa_subtotal["months"][1] == -12000
    assert casa_subtotal["total"] == -102000

    assert data["month_totals"][0] == 110000  # Jan: 200000 - 90000
    assert data["month_totals"][1] == 198000  # Feb: 210000 - 12000
    assert data["year_total"] == 308000
