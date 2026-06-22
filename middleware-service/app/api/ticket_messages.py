import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.ticket_message import TicketMessageCreate, TicketMessageResponse
from app.repositories import TicketMessageRepository, TicketRepository

router = APIRouter(prefix='/tickets/{ticket_id}/messages', tags=['ticket-messages'])


@router.post('', response_model=TicketMessageResponse, status_code=201)
async def add_message(ticket_id: uuid.UUID, data: TicketMessageCreate, db: Session = Depends(get_db)):
    ticket = TicketRepository(db).get(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    return TicketMessageRepository(db).create(
        ticket_id=ticket_id,
        content=data.content,
        from_whatsapp=data.from_whatsapp,
    )


@router.get('', response_model=list[TicketMessageResponse])
async def list_messages(
    ticket_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    ticket = TicketRepository(db).get(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail='Ticket not found')
    return TicketMessageRepository(db).list_by_ticket(ticket_id=ticket_id, limit=limit, offset=offset)
