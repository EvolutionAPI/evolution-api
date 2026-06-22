import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.whatsapp_session import WhatsappSession


class WhatsappSessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_or_create(self, phone_number: str, tenant_id: uuid.UUID) -> WhatsappSession:
        session = (
            self.db.query(WhatsappSession)
            .filter(WhatsappSession.phone_number == phone_number, WhatsappSession.tenant_id == tenant_id)
            .first()
        )
        if session:
            session.last_activity = datetime.utcnow()
            self.db.commit()
            self.db.refresh(session)
            return session
        session = WhatsappSession(
            phone_number=phone_number,
            tenant_id=tenant_id,
            state='MAIN_MENU',
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def get(self, session_id: uuid.UUID) -> WhatsappSession | None:
        return self.db.query(WhatsappSession).filter(WhatsappSession.id == session_id).first()

    def update_state(self, session: WhatsappSession, state: str) -> WhatsappSession:
        session.state = state
        session.last_activity = datetime.utcnow()
        self.db.commit()
        self.db.refresh(session)
        return session

    def update_draft(self, session: WhatsappSession, draft: dict | None) -> WhatsappSession:
        session.ticket_draft = draft
        session.last_activity = datetime.utcnow()
        self.db.commit()
        self.db.refresh(session)
        return session

    def set_customer(self, session: WhatsappSession, customer_id: uuid.UUID) -> WhatsappSession:
        session.customer_id = customer_id
        session.last_activity = datetime.utcnow()
        self.db.commit()
        self.db.refresh(session)
        return session

    def cleanup_stale(self, hours: int = 24) -> int:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        deleted = self.db.query(WhatsappSession).filter(WhatsappSession.last_activity < cutoff).delete()
        self.db.commit()
        return deleted or 0
