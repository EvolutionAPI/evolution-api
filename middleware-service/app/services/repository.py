from sqlalchemy.orm import Session

from app.models.event_log import EventLog


class EventLogRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, source: str, event_type: str, payload: dict, status: str = 'received') -> EventLog:
        event = EventLog(source=source, event_type=event_type, payload=payload, status=status)
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event
