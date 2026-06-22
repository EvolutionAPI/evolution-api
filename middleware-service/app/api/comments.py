import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.ticket_comment import TicketCommentCreate, TicketCommentResponse, TicketCommentUpdate
from app.repositories import TicketCommentRepository
from app.services.ticket_service import TicketService

router = APIRouter(prefix='/tickets/{ticket_id}/comments', tags=['ticket-comments'])


@router.post('', response_model=TicketCommentResponse, status_code=201)
async def add_comment(ticket_id: uuid.UUID, data: TicketCommentCreate, db: Session = Depends(get_db)):
    comment = TicketService(db).add_comment(ticket_id, data)
    if not comment:
        raise HTTPException(status_code=404, detail='Ticket not found')
    return comment


@router.get('', response_model=list[TicketCommentResponse])
async def list_comments(
    ticket_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return TicketCommentRepository(db).list_by_ticket(ticket_id=ticket_id, limit=limit, offset=offset)


@router.patch('/{comment_id}', response_model=TicketCommentResponse)
async def update_comment(
    ticket_id: uuid.UUID,
    comment_id: uuid.UUID,
    data: TicketCommentUpdate,
    db: Session = Depends(get_db),
):
    repo = TicketCommentRepository(db)
    comment = repo.get(comment_id)
    if not comment or comment.ticket_id != ticket_id:
        raise HTTPException(status_code=404, detail='Comment not found')
    return repo.update(comment, data.message_text)


@router.delete('/{comment_id}', response_model=TicketCommentResponse)
async def delete_comment(ticket_id: uuid.UUID, comment_id: uuid.UUID, db: Session = Depends(get_db)):
    repo = TicketCommentRepository(db)
    comment = repo.get(comment_id)
    if not comment or comment.ticket_id != ticket_id:
        raise HTTPException(status_code=404, detail='Comment not found')
    return repo.soft_delete(comment)
