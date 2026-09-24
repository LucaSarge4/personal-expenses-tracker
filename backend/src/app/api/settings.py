from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.models import Setting

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings(session: Session = Depends(get_session)) -> dict[str, str]:
    return {s.key: s.value for s in session.exec(select(Setting)).all()}


@router.put("")
def update_settings(
    payload: dict[str, str], session: Session = Depends(get_session)
) -> dict[str, str]:
    for key, value in payload.items():
        setting = session.get(Setting, key)
        if setting is None:
            setting = Setting(key=key, value=value)
        else:
            setting.value = value
        session.add(setting)
    session.commit()
    return {s.key: s.value for s in session.exec(select(Setting)).all()}
