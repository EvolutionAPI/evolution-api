from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.ticket import TicketCreate, TicketDetailResponse, TicketResponse, TicketUpdate
from app.services.ticket_repository import TicketRepository
from app.services.ticket_service import TicketService

router = APIRouter(prefix='/tickets', tags=['tickets'])


@router.post('', response_model=TicketResponse, status_code=201)
async def create_ticket(data: TicketCreate, db: Session = Depends(get_db)):
    return TicketService(db).create_ticket(data)


@router.get('', response_model=list[TicketResponse])
async def list_tickets(
    status: str | None = Query(default=None),
    customer_id: int | None = Query(default=None),
    customer_phone_number: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return TicketRepository(db).list(
        status=status,
        customer_id=customer_id,
        customer_phone_number=customer_phone_number,
        limit=limit,
        offset=offset,
    )


@router.get('/{ticket_id}', response_model=TicketDetailResponse)
async def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = TicketRepository(db).get(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    return ticket


@router.patch('/{ticket_id}', response_model=TicketResponse)
async def update_ticket(ticket_id: int, data: TicketUpdate, db: Session = Depends(get_db)):
    ticket = TicketService(db).update_ticket(ticket_id, data)
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    return ticket


@router.delete('/{ticket_id}', response_model=TicketResponse)
async def delete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = TicketService(db).soft_delete_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    return ticket
