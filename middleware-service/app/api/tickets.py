import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.ticket import TicketCreate, TicketDetailResponse, TicketResponse, TicketUpdate
from app.repositories import CustomerRepository, TicketRepository, TenantRepository

router = APIRouter(prefix='/tickets', tags=['tickets'])


@router.post('', response_model=TicketResponse, status_code=201)
async def create_ticket(data: TicketCreate, db: Session = Depends(get_db)):
    tenant_repo = TenantRepository(db)
    customer_repo = CustomerRepository(db)

    tenant = tenant_repo.get(data.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail='Tenant not found')

    customer = customer_repo.get(data.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail='Customer not found')

    if customer.tenant_id != data.tenant_id:
        raise HTTPException(status_code=400, detail='Customer does not belong to this tenant')

    return TicketRepository(db).create(
        tenant_id=data.tenant_id,
        customer_id=data.customer_id,
        subject=data.subject,
        description=data.description,
        category=data.category,
        source=data.source,
    )


@router.get('', response_model=list[TicketResponse])
async def list_tickets(
    tenant_id: uuid.UUID | None = Query(default=None),
    customer_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return TicketRepository(db).list_all(
        tenant_id=tenant_id,
        customer_id=customer_id,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.get('/{ticket_id}', response_model=TicketDetailResponse)
async def get_ticket(ticket_id: uuid.UUID, db: Session = Depends(get_db)):
    ticket = TicketRepository(db).get(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    return ticket


@router.put('/{ticket_id}', response_model=TicketResponse)
async def update_ticket(ticket_id: uuid.UUID, data: TicketUpdate, db: Session = Depends(get_db)):
    repo = TicketRepository(db)
    ticket = repo.get(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    values = data.model_dump(exclude_unset=True)
    return repo.update(ticket, **values)


@router.delete('/{ticket_id}', response_model=TicketResponse)
async def delete_ticket(ticket_id: uuid.UUID, db: Session = Depends(get_db)):
    repo = TicketRepository(db)
    ticket = repo.get(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    return repo.soft_delete(ticket)
