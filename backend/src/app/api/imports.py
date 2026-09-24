import tempfile
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlmodel import Session, select

from app.db import get_session
from app.ingest.pipeline import (
    backup_database,
    confirm_import,
    get_account_or_none,
    reclassify_import,
    run_import,
    sha256_of,
    store_statement_file,
)
from app.models import ImportStatus, StatementImport, Transaction
from app.schemas import ImportRead

router = APIRouter(prefix="/api/imports", tags=["imports"])


@router.get("", response_model=list[ImportRead])
def list_imports(session: Session = Depends(get_session)) -> list[StatementImport]:
    return list(
        session.exec(select(StatementImport).order_by(StatementImport.created_at.desc())).all()
    )


@router.get("/{import_id}", response_model=ImportRead)
def get_import(import_id: int, session: Session = Depends(get_session)) -> StatementImport:
    statement_import = session.get(StatementImport, import_id)
    if statement_import is None:
        raise HTTPException(status_code=404, detail="Import not found")
    return statement_import


@router.post("", response_model=list[ImportRead])
async def create_imports(
    background_tasks: BackgroundTasks,
    account_id: int,
    files: list[UploadFile],
    session: Session = Depends(get_session),
) -> list[StatementImport]:
    account = get_account_or_none(session, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    created: list[StatementImport] = []
    for upload in files:
        content = await upload.read()
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)
        digest = sha256_of(tmp_path)
        tmp_path.unlink()

        existing = session.exec(
            select(StatementImport).where(StatementImport.sha256 == digest)
        ).first()
        if existing is not None:
            raise HTTPException(
                status_code=409, detail=f"File '{upload.filename}' was already imported"
            )

        backup_database()
        stored_path = store_statement_file(account.name, upload.filename or "statement", content)

        statement_import = StatementImport(
            account_id=account_id,
            filename=upload.filename or "statement",
            stored_path=str(stored_path),
            sha256=digest,
            status=ImportStatus.queued,
        )
        session.add(statement_import)
        session.commit()
        session.refresh(statement_import)
        created.append(statement_import)

        background_tasks.add_task(run_import, statement_import.id)

    return created


@router.post("/{import_id}/confirm", response_model=ImportRead)
def confirm(import_id: int, session: Session = Depends(get_session)) -> StatementImport:
    statement_import = confirm_import(session, import_id)
    if statement_import is None:
        raise HTTPException(status_code=404, detail="Import not found")
    return statement_import


@router.post("/{import_id}/reclassify", response_model=ImportRead)
def reclassify(import_id: int, session: Session = Depends(get_session)) -> StatementImport:
    statement_import = reclassify_import(session, import_id)
    if statement_import is None:
        raise HTTPException(status_code=404, detail="Import not found")
    return statement_import


@router.delete("/{import_id}")
def delete_import(import_id: int, session: Session = Depends(get_session)) -> dict[str, bool]:
    statement_import = session.get(StatementImport, import_id)
    if statement_import is None:
        raise HTTPException(status_code=404, detail="Import not found")

    txns = session.exec(select(Transaction).where(Transaction.import_id == import_id)).all()
    for txn in txns:
        session.delete(txn)
    session.commit()

    stored_path = Path(statement_import.stored_path)
    if stored_path.exists():
        stored_path.unlink()

    session.delete(statement_import)
    session.commit()
    return {"ok": True}
