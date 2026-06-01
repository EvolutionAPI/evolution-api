from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.customer import CustomerCreate, CustomerResponse
from app.schemas.ticket import TicketResponse
from app.services.ticket_repository import CustomerRepository, TicketRepository

router = APIRouter(prefix='/customers', tags=['customers'])


@router.post('', response_model=CustomerResponse, status_code=201)
async def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    return CustomerRepository(db).get_or_create(data.phone_number, data.external_customer_id)


@router.get('', response_model=list[CustomerResponse])
async def list_customers(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return CustomerRepository(db).list(limit=limit, offset=offset)


@router.get('/phone/{phone_number}', response_model=CustomerResponse)
async def get_customer_by_phone(phone_number: str, db: Session = Depends(get_db)):
    customer = CustomerRepository(db).get_by_phone(phone_number)
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')
    return customer


@router.get('/{customer_id}/tickets', response_model=list[TicketResponse])
async def list_customer_tickets(
    customer_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return TicketRepository(db).list(customer_id=customer_id, limit=limit, offset=offset)
