import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.instance_tenant import InstanceLinkCreate, InstanceLinkDetailResponse, InstanceLinkResponse
from app.repositories import InstanceTenantRepository, TenantRepository

router = APIRouter(prefix='/instances', tags=['instances'])


@router.post('/link', response_model=InstanceLinkResponse, status_code=201)
async def link_instance(data: InstanceLinkCreate, db: Session = Depends(get_db)):
    repo = InstanceTenantRepository(db)
    tenant_repo = TenantRepository(db)

    tenant = tenant_repo.get(data.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail='Tenant not found')

    existing = repo.get_by_instance(data.instance_name)
    if existing:
        raise HTTPException(status_code=409, detail='Instance already linked to a tenant')

    return repo.create(instance_name=data.instance_name, tenant_id=data.tenant_id)


@router.get('', response_model=list[InstanceLinkDetailResponse])
async def list_links(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    links = InstanceTenantRepository(db).list_all(limit=limit, offset=offset)
    return [
        InstanceLinkDetailResponse(
            id=link.id,
            instance_name=link.instance_name,
            tenant_id=link.tenant_id,
            created_at=link.created_at,
            tenant_name=link.tenant.name if link.tenant else None,
        )
        for link in links
    ]


@router.get('/{instance_name}', response_model=InstanceLinkDetailResponse)
async def get_link(instance_name: str, db: Session = Depends(get_db)):
    link = InstanceTenantRepository(db).get_by_instance(instance_name)
    if not link:
        raise HTTPException(status_code=404, detail='Instance not linked to any tenant')
    return InstanceLinkDetailResponse(
        id=link.id,
        instance_name=link.instance_name,
        tenant_id=link.tenant_id,
        created_at=link.created_at,
        tenant_name=link.tenant.name if link.tenant else None,
    )


@router.delete('/{instance_name}', status_code=204)
async def unlink_instance(instance_name: str, db: Session = Depends(get_db)):
    repo = InstanceTenantRepository(db)
    link = repo.get_by_instance(instance_name)
    if not link:
        raise HTTPException(status_code=404, detail='Instance not linked to any tenant')
    repo.delete(link)
