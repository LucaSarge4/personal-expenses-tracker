from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import Rule
from app.schemas import RuleCreate, RuleRead

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("", response_model=list[RuleRead])
def list_rules(session: Session = Depends(get_session)) -> list[Rule]:
    return list(session.exec(select(Rule)).all())


@router.post("", response_model=RuleRead)
def create_rule(payload: RuleCreate, session: Session = Depends(get_session)) -> Rule:
    rule = Rule(**payload.model_dump())
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, session: Session = Depends(get_session)) -> dict[str, bool]:
    rule = session.get(Rule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    session.delete(rule)
    session.commit()
    return {"ok": True}
