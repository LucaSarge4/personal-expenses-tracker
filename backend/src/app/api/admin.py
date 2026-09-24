from pathlib import Path

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.ingest.pipeline import backup_database
from app.models import Account, Category, Rule, StatementImport, Transaction
from app.schemas import AdminResetRequest, AdminResetResult

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/reset", response_model=AdminResetResult)
def reset(payload: AdminResetRequest, session: Session = Depends(get_session)) -> AdminResetResult:
    """Bulk-delete data by type, in dependency order (children before parents).

    Deleting accounts or categories forces their dependents (imports/
    transactions, or rules) to be cleared too, since those foreign keys are
    not nullable (accounts) or would otherwise orphan a rule (categories).
    A DB backup is always taken first, mirroring the import pipeline.
    """
    backup_database()

    delete_accounts = payload.accounts
    delete_imports = payload.imports or delete_accounts
    delete_transactions = payload.transactions or delete_accounts
    delete_categories = payload.categories
    delete_rules = payload.rules or delete_categories

    transactions_deleted = 0
    imports_deleted = 0
    rules_deleted = 0
    categories_deleted = 0
    accounts_deleted = 0

    if delete_transactions:
        txns = session.exec(select(Transaction)).all()
        transactions_deleted = len(txns)
        for txn in txns:
            session.delete(txn)
        session.commit()

    if delete_imports:
        if not delete_transactions:
            for txn in session.exec(
                select(Transaction).where(Transaction.import_id.is_not(None))
            ).all():
                txn.import_id = None
                session.add(txn)
            session.commit()

        imports = session.exec(select(StatementImport)).all()
        imports_deleted = len(imports)
        for statement_import in imports:
            stored_path = Path(statement_import.stored_path)
            if stored_path.exists():
                stored_path.unlink()
            session.delete(statement_import)
        session.commit()

    if delete_rules:
        rules = session.exec(select(Rule)).all()
        rules_deleted = len(rules)
        for rule in rules:
            session.delete(rule)
        session.commit()

    if delete_categories:
        if not delete_transactions:
            for txn in session.exec(
                select(Transaction).where(Transaction.category_id.is_not(None))
            ).all():
                txn.category_id = None
                session.add(txn)
            session.commit()

        categories = session.exec(select(Category)).all()
        categories_deleted = len(categories)
        for category in categories:
            session.delete(category)
        session.commit()

    if delete_accounts:
        accounts = session.exec(select(Account)).all()
        accounts_deleted = len(accounts)
        for account in accounts:
            session.delete(account)
        session.commit()

    return AdminResetResult(
        transactions_deleted=transactions_deleted,
        imports_deleted=imports_deleted,
        rules_deleted=rules_deleted,
        categories_deleted=categories_deleted,
        accounts_deleted=accounts_deleted,
    )
