import hashlib
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path

from sqlmodel import Session, select

from app.config import settings
from app.db import engine
from app.i18n import get_locale
from app.ingest.classify import apply_rules, llm_classify
from app.ingest.dedupe import hashes_for_import, normalize
from app.ingest.extract_text import extract
from app.ingest.llm_extract import extract_transactions, reconcile
from app.models import Account, ImportStatus, Setting, StatementImport, Transaction

SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _slugify(name: str) -> str:
    return SAFE_NAME_RE.sub("-", name).strip("-").lower() or "account"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def backup_database() -> None:
    if not settings.db_path.exists():
        return
    settings.backups_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    dest = settings.backups_dir / f"expenses-{timestamp}.db"
    shutil.copy2(settings.db_path, dest)

    backups = sorted(settings.backups_dir.glob("expenses-*.db"))
    for old in backups[:-20]:
        old.unlink()


def store_statement_file(account_name: str, original_filename: str, content: bytes) -> Path:
    account_dir = settings.statements_dir / _slugify(account_name)
    account_dir.mkdir(parents=True, exist_ok=True)
    month_prefix = datetime.now(UTC).strftime("%Y-%m")
    dest = account_dir / f"{month_prefix}_{original_filename}"
    dest.write_bytes(content)
    return dest


def _get_batch_size() -> int:
    with Session(engine) as session:
        setting = session.get(Setting, "classify_batch_size")
    return int(setting.value) if setting else 25


def run_import(import_id: int) -> None:
    with Session(engine) as session:
        statement_import = session.get(StatementImport, import_id)
        if statement_import is None:
            return

        try:
            statement_import.status = ImportStatus.extracting
            session.add(statement_import)
            session.commit()

            chunks = extract(statement_import.stored_path)
            statement_import.progress = 10
            session.add(statement_import)
            session.commit()

            def _on_chunk_done(done: int, total: int) -> None:
                statement_import.progress = 10 + int(done / total * 50)
                session.add(statement_import)
                session.commit()

            locale = get_locale(session)
            result = extract_transactions(chunks, locale=locale, on_chunk_done=_on_chunk_done)
            statement_import.extracted_count = len(result.transactions)
            statement_import.progress = 60
            diff = reconcile(result)
            statement_import.reconcile_diff_cents = int(diff * 100) if diff is not None else None
            session.add(statement_import)
            session.commit()

            existing_hashes = set(session.exec(select(Transaction.dedupe_hash)).all())
            items = [(t.date, int(t.amount * 100), t.description) for t in result.transactions]
            hashes = hashes_for_import(statement_import.account_id, items)

            new_txns: list[Transaction] = []
            duplicate_count = 0
            for extracted, txn_hash in zip(result.transactions, hashes, strict=True):
                if txn_hash in existing_hashes:
                    duplicate_count += 1
                    continue
                existing_hashes.add(txn_hash)
                new_txns.append(
                    Transaction(
                        account_id=statement_import.account_id,
                        import_id=statement_import.id,
                        date=extracted.date,
                        description_raw=extracted.description,
                        counterparty=normalize(extracted.description),
                        amount_cents=int(extracted.amount * 100),
                        currency=extracted.currency,
                        dedupe_hash=txn_hash,
                    )
                )

            session.add_all(new_txns)
            session.commit()
            for txn in new_txns:
                session.refresh(txn)

            statement_import.inserted_count = len(new_txns)
            statement_import.duplicate_count = duplicate_count
            statement_import.status = ImportStatus.classifying
            statement_import.progress = 75
            session.add(statement_import)
            session.commit()

            def _on_batch_done(done: int, total: int) -> None:
                statement_import.progress = 75 + int(done / total * 25)
                session.add(statement_import)
                session.commit()

            remaining = apply_rules(session, new_txns)
            llm_classify(
                session,
                remaining,
                batch_size=_get_batch_size(),
                on_batch_done=_on_batch_done,
            )
            session.add_all(new_txns)
            session.commit()

            statement_import.low_confidence_count = sum(
                1 for t in new_txns if (t.confidence or 0) < 0.7
            )
            statement_import.status = ImportStatus.review
            statement_import.progress = 100
            session.add(statement_import)
            session.commit()
        except Exception as exc:  # noqa: BLE001
            statement_import.status = ImportStatus.error
            statement_import.error = str(exc)
            session.add(statement_import)
            session.commit()


def confirm_import(session: Session, import_id: int) -> StatementImport | None:
    statement_import = session.get(StatementImport, import_id)
    if statement_import is None:
        return None
    txns = session.exec(select(Transaction).where(Transaction.import_id == import_id)).all()
    for txn in txns:
        txn.reviewed = True
        session.add(txn)
    statement_import.status = ImportStatus.done
    session.add(statement_import)
    session.commit()
    session.refresh(statement_import)
    return statement_import


def reclassify_import(session: Session, import_id: int) -> StatementImport | None:
    statement_import = session.get(StatementImport, import_id)
    if statement_import is None:
        return None
    txns = session.exec(
        select(Transaction).where(
            Transaction.import_id == import_id,
            Transaction.reviewed == False,  # noqa: E712
        )
    ).all()
    remaining = apply_rules(session, txns)
    llm_classify(session, remaining, batch_size=_get_batch_size())
    session.add_all(txns)
    statement_import.low_confidence_count = sum(1 for t in txns if (t.confidence or 0) < 0.7)
    session.add(statement_import)
    session.commit()
    session.refresh(statement_import)
    return statement_import


def get_account_or_none(session: Session, account_id: int) -> Account | None:
    return session.get(Account, account_id)
