from sqlmodel import Session, select

from app.config import settings
from app.i18n import resolve_locale
from app.models import Category, CategoryKind, Setting

# 20 accessible, visually distinct colors.
PALETTE = [
    "#2563eb",
    "#16a34a",
    "#dc2626",
    "#d97706",
    "#7c3aed",
    "#0891b2",
    "#db2777",
    "#65a30d",
    "#4f46e5",
    "#ea580c",
    "#0d9488",
    "#9333ea",
    "#ca8a04",
    "#e11d48",
    "#059669",
    "#2dd4bf",
    "#f59e0b",
    "#8b5cf6",
    "#0284c7",
    "#78716c",
]

# Generic, bank-agnostic starter categories (not tied to any one person's
# bank statement structure), one list per supported locale. Purely additive
# to new/empty databases — see seed_categories()'s guard below, which never
# touches an environment that already has categories.
SEED_CATEGORIES_BY_LOCALE: dict[str, list[dict]] = {
    "en": [
        # Income
        {"name": "Salary", "kind": CategoryKind.income},
        {"name": "Freelance/Business", "kind": CategoryKind.income},
        {"name": "Interest/Dividends", "kind": CategoryKind.income},
        {"name": "Other Income", "kind": CategoryKind.income},
        # Expenses - Housing group
        {"name": "Rent/Mortgage", "kind": CategoryKind.expense, "group": "Housing"},
        {"name": "Utilities", "kind": CategoryKind.expense, "group": "Housing"},
        {"name": "Groceries", "kind": CategoryKind.expense, "group": "Housing"},
        {"name": "Home Expenses", "kind": CategoryKind.expense, "group": "Housing"},
        # Expenses - other
        {"name": "Health", "kind": CategoryKind.expense},
        {"name": "Insurance", "kind": CategoryKind.expense},
        {"name": "Investments", "kind": CategoryKind.expense},
        {"name": "Transport", "kind": CategoryKind.expense},
        {"name": "Dining Out", "kind": CategoryKind.expense},
        {"name": "Shopping", "kind": CategoryKind.expense},
        {"name": "Fitness", "kind": CategoryKind.expense},
        {"name": "Subscriptions", "kind": CategoryKind.expense},
        {"name": "Travel", "kind": CategoryKind.expense},
        {"name": "Entertainment", "kind": CategoryKind.expense},
        {"name": "Taxes", "kind": CategoryKind.expense},
        # Transfer / fallback
        {"name": "Transfer", "kind": CategoryKind.transfer, "exclude_from_totals": True},
        {"name": "Other", "kind": CategoryKind.expense},
    ],
    "it": [
        # Entrate
        {"name": "Stipendio", "kind": CategoryKind.income},
        {"name": "Lavoro Autonomo", "kind": CategoryKind.income},
        {"name": "Interessi/Dividendi", "kind": CategoryKind.income},
        {"name": "Altre Entrate", "kind": CategoryKind.income},
        # Spese - gruppo Casa
        {"name": "Affitto/Mutuo", "kind": CategoryKind.expense, "group": "Casa"},
        {"name": "Utenze", "kind": CategoryKind.expense, "group": "Casa"},
        {"name": "Spesa", "kind": CategoryKind.expense, "group": "Casa"},
        {"name": "Spese Casa", "kind": CategoryKind.expense, "group": "Casa"},
        # Spese - altro
        {"name": "Salute", "kind": CategoryKind.expense},
        {"name": "Assicurazioni", "kind": CategoryKind.expense},
        {"name": "Investimenti", "kind": CategoryKind.expense},
        {"name": "Trasporti", "kind": CategoryKind.expense},
        {"name": "Ristoranti", "kind": CategoryKind.expense},
        {"name": "Shopping", "kind": CategoryKind.expense},
        {"name": "Palestra", "kind": CategoryKind.expense},
        {"name": "Abbonamenti", "kind": CategoryKind.expense},
        {"name": "Viaggi", "kind": CategoryKind.expense},
        {"name": "Svago", "kind": CategoryKind.expense},
        {"name": "Tasse", "kind": CategoryKind.expense},
        # Giroconto / altro
        {"name": "Giroconto", "kind": CategoryKind.transfer, "exclude_from_totals": True},
        {"name": "Altro", "kind": CategoryKind.expense},
    ],
}

DEFAULT_SETTINGS = {
    "llm_base_url": settings.default_llm_base_url,
    "llm_model": settings.default_llm_model,
    "extract_chunk_lines": "60",
    "classify_batch_size": "25",
    "llm_timeout_s": "300",
    "locale": settings.default_locale,
}


def seed_categories(session: Session) -> None:
    existing = session.exec(select(Category)).first()
    if existing is not None:
        return
    locale = resolve_locale(settings.default_locale)
    for sort_order, spec in enumerate(SEED_CATEGORIES_BY_LOCALE[locale]):
        color = PALETTE[sort_order % len(PALETTE)]
        session.add(
            Category(
                name=spec["name"],
                kind=spec["kind"],
                group=spec.get("group"),
                color=color,
                exclude_from_totals=spec.get("exclude_from_totals", False),
                sort_order=sort_order,
            )
        )
    session.commit()


def seed_settings(session: Session) -> None:
    existing_keys = set(session.exec(select(Setting.key)).all())
    for key, value in DEFAULT_SETTINGS.items():
        if key not in existing_keys:
            session.add(Setting(key=key, value=value))
    session.commit()


def seed_all(session: Session) -> None:
    seed_categories(session)
    seed_settings(session)


if __name__ == "__main__":
    # Run the same Alembic migrations the app uses on startup, rather than a
    # raw `create_all()`, so a DATA_DIR seeded here (e.g. `make seed-demo`)
    # has a schema the real app's own migration run recognizes as up to date.
    from app.db import engine
    from app.main import run_migrations

    run_migrations()
    with Session(engine) as session:
        seed_all(session)
