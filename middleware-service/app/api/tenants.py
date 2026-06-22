import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.tenant import TenantCreate, TenantResponse, TenantUpdate
from app.repositories import TenantRepository

router = APIRouter(prefix='/tenants', tags=['tenants'])


@router.post('', response_model=TenantResponse, status_code=201)
async def create_tenant(data: TenantCreate, db: Session = Depends(get_db)):
    repo = TenantRepository(db)
    existing = repo.get_by_name(data.name)
    if existing:
        raise HTTPException(status_code=409, detail='Tenant with this name already exists')
    return repo.create(name=data.name)


@router.get('', response_model=list[TenantResponse])
async def list_tenants(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return TenantRepository(db).list_all(limit=limit, offset=offset)


@router.get('/{tenant_id}', response_model=TenantResponse)
async def get_tenant(tenant_id: uuid.UUID, db: Session = Depends(get_db)):
    tenant = TenantRepository(db).get(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail='Tenant not found')
    return tenant


@router.put('/{tenant_id}', response_model=TenantResponse)
async def update_tenant(tenant_id: uuid.UUID, data: TenantUpdate, db: Session = Depends(get_db)):
    repo = TenantRepository(db)
    tenant = repo.get(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail='Tenant not found')
    if data.name and data.name != tenant.name:
        existing = repo.get_by_name(data.name)
        if existing:
            raise HTTPException(status_code=409, detail='Tenant with this name already exists')
    return repo.update(tenant, name=data.name)


@router.delete('/{tenant_id}', status_code=204)
async def delete_tenant(tenant_id: uuid.UUID, db: Session = Depends(get_db)):
    repo = TenantRepository(db)
    tenant = repo.get(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail='Tenant not found')
    repo.delete(tenant)
