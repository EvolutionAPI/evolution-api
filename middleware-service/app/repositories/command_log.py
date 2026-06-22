import uuid

from sqlalchemy.orm import Session

from app.models.command_log import CommandLog


class CommandLogRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        command_type: str,
        raw_text: str,
        parsed_payload: dict,
        source_message_id: str | None = None,
        ticket_id: uuid.UUID | None = None,
        status: str = 'processed',
        error_message: str | None = None,
    ) -> CommandLog:
        log = CommandLog(
            source_message_id=source_message_id,
            command_type=command_type,
            ticket_id=ticket_id,
            raw_text=raw_text,
            parsed_payload=parsed_payload,
            status=status,
            error_message=error_message,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log
