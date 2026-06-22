import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.customer import CustomerCreate, CustomerResponse, CustomerUpdate
from app.repositories import CustomerRepository

router = APIRouter(prefix='/customers', tags=['customers'])


@router.post('', response_model=CustomerResponse, status_code=201)
async def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    repo = CustomerRepository(db)
    existing = repo.get_by_phone_and_tenant(data.phone_number, data.tenant_id)
    if existing:
        raise HTTPException(status_code=409, detail='Customer with this phone and tenant already exists')
    return repo.get_or_create(
        phone_number=data.phone_number,
        tenant_id=data.tenant_id,
        name=data.name,
        email=data.email,
    )


@router.get('', response_model=list[CustomerResponse])
async def list_customers(
    tenant_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return CustomerRepository(db).list_all(tenant_id=tenant_id, limit=limit, offset=offset)


@router.get('/phone/{phone_number}', response_model=CustomerResponse)
async def get_customer_by_phone(phone_number: str, tenant_id: uuid.UUID = Query(...), db: Session = Depends(get_db)):
    customer = CustomerRepository(db).get_by_phone_and_tenant(phone_number, tenant_id)
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')
    return customer


@router.get('/{customer_id}', response_model=CustomerResponse)
async def get_customer(customer_id: uuid.UUID, db: Session = Depends(get_db)):
    customer = CustomerRepository(db).get(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')
    return customer


@router.put('/{customer_id}', response_model=CustomerResponse)
async def update_customer(customer_id: uuid.UUID, data: CustomerUpdate, db: Session = Depends(get_db)):
    repo = CustomerRepository(db)
    customer = repo.get(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')
    return repo.update(customer, name=data.name, email=data.email, phone_number=data.phone_number)
