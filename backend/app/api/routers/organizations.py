from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.api.deps import current_user
from app.db.session import get_db
from app.models.identity import User
from app.schemas.core import OrgCreate, OrgOut
from app.services import org_service

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("", response_model=OrgOut, status_code=201)
def create_organization(
    body: OrgCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> OrgOut:
    org = org_service.create_org(db, user.id, body.name)
    return OrgOut.model_validate(org)


@router.get("", response_model=list[OrgOut])
def list_organizations(
    db: DbSession = Depends(get_db),
    user: User = Depends(current_user),
) -> list[OrgOut]:
    return [OrgOut.model_validate(o) for o in org_service.list_orgs(db, user.id)]
