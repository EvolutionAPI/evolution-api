import uuid
import logging

from sqlalchemy.orm import Session

from app.models.ticket import Ticket
from app.models.whatsapp_session import WhatsappSession
from app.services.evolution_api import EvolutionAPIService
from app.repositories import (
    CustomerRepository,
    InstanceTenantRepository,
    TicketMessageRepository,
    TicketRepository,
    WhatsappSessionRepository,
)

logger = logging.getLogger(__name__)

CATEGORIES = {
    '1': 'Network',
    '2': 'Billing',
    '3': 'Technical Support',
    '4': 'Other',
}

CATEGORY_OPTIONS = '\n'.join([f'{k}. {v}' for k, v in CATEGORIES.items()])

MAIN_MENU_TEXT = (
    'Welcome to Support!\n\n'
    'How can we help you?\n'
    '1. Create Ticket\n'
    '2. Check Ticket Status\n'
    '3. Speak to Agent'
)

TICKET_CREATED_TEMPLATE = (
    'Your ticket has been created successfully!\n\n'
    'Ticket Number: {ticket_number}\n'
    'Status: Open\n\n'
    'We will get back to you as soon as possible.'
)


class ConversationService:
    def __init__(self, db: Session):
        self.db = db
        self.customers = CustomerRepository(db)
        self.tickets = TicketRepository(db)
        self.ticket_messages = TicketMessageRepository(db)
        self.sessions = WhatsappSessionRepository(db)
        self.instance_tenants = InstanceTenantRepository(db)
        self.evolution_api = EvolutionAPIService()

    def process_message(self, instance_name: str, phone_number: str, text: str, message_id: str | None = None) -> str:
        link = self.instance_tenants.get_by_instance(instance_name)
        if not link:
            logger.warning('No tenant linked to instance %s', instance_name)
            return 'This support line is not configured. Please contact the administrator.'

        tenant_id = link.tenant_id

        customer = self.customers.get_or_create(phone_number, tenant_id)

        session = self.sessions.get_or_create(phone_number, tenant_id)
        self.sessions.set_customer(session, customer.id)

        reply = self._handle_state(session, text.strip(), customer.id, tenant_id)

        self.sessions.update_state(session, session.state)

        return reply

    def _handle_state(self, session: WhatsappSession, text: str, customer_id: uuid.UUID, tenant_id: uuid.UUID) -> str:
        state = session.state

        if state == 'MAIN_MENU':
            return self._handle_main_menu(session, text, customer_id, tenant_id)

        if state == 'WAITING_DESCRIPTION':
            return self._handle_description(session, text)

        if state == 'WAITING_CATEGORY':
            return self._handle_category(session, text)

        if state == 'CONFIRM_TICKET':
            return self._handle_confirm(session, text, customer_id, tenant_id)

        if state == 'CHECKING_TICKET':
            return self._handle_check_ticket(session, text, tenant_id)

        if state == 'COMPLETED':
            session.state = 'MAIN_MENU'
            return MAIN_MENU_TEXT

        session.state = 'MAIN_MENU'
        return MAIN_MENU_TEXT

    def _handle_main_menu(self, session: WhatsappSession, text: str, customer_id: uuid.UUID, tenant_id: uuid.UUID) -> str:
        choice = text.strip()

        if choice == '1':
            session.state = 'WAITING_DESCRIPTION'
            session.ticket_draft = {}
            return (
                'Please briefly describe your issue.\n\n'
                'Include as much detail as possible so we can assist you better.'
            )

        if choice == '2':
            session.state = 'CHECKING_TICKET'
            return 'Please enter your ticket number (e.g., INC-00001).'

        if choice == '3':
            session.state = 'COMPLETED'
            return 'An agent will contact you shortly. Is there anything else we can help with? (Send any message to return to menu)'

        natural = self._try_auto_create(session, text, customer_id, tenant_id)
        if natural:
            return natural

        return (
            f'I did not understand that. Please choose an option:\n\n{MAIN_MENU_TEXT}'
        )

    def _try_auto_create(self, session: WhatsappSession, text: str, customer_id: uuid.UUID, tenant_id: uuid.UUID) -> str | None:
        words = text.split()
        if len(words) < 2:
            return None

        session.ticket_draft = {
            'subject': text[:500],
            'description': text,
            'customer_id': str(customer_id),
            'tenant_id': str(tenant_id),
        }
        session.state = 'CONFIRM_TICKET'

        return (
            f'I understood your issue as:\n\n'
            f'"{text}"\n\n'
            f'Would you like me to create a support ticket?\n'
            f'1. Yes, create ticket\n'
            f'2. No, cancel'
        )

    def _handle_description(self, session: WhatsappSession, text: str) -> str:
        session.ticket_draft = {
            'subject': text[:500],
            'description': text,
            'customer_id': str(session.customer_id) if session.customer_id else None,
            'tenant_id': None,
        }
        session.state = 'WAITING_CATEGORY'

        return (
            'Which category best describes your issue?\n\n'
            f'{CATEGORY_OPTIONS}'
        )

    def _handle_category(self, session: WhatsappSession, text: str) -> str:
        category = CATEGORIES.get(text.strip())
        if not category:
            return (
                'Invalid category. Please choose a valid option:\n\n'
                f'{CATEGORY_OPTIONS}'
            )

        draft = session.ticket_draft or {}
        draft['category'] = category
        session.ticket_draft = draft
        session.state = 'CONFIRM_TICKET'

        return (
            'Please confirm your ticket details:\n\n'
            f'Issue: {draft.get("subject", "N/A")}\n'
            f'Category: {category}\n\n'
            '1. Submit\n'
            '2. Edit Description\n'
            '3. Cancel'
        )

    def _handle_confirm(self, session: WhatsappSession, text: str, customer_id: uuid.UUID, tenant_id: uuid.UUID) -> str:
        choice = text.strip()

        if choice == '1':
            draft = session.ticket_draft or {}
            ticket = self.tickets.create(
                tenant_id=tenant_id,
                customer_id=customer_id,
                subject=draft.get('subject', 'No subject'),
                description=draft.get('description'),
                category=draft.get('category'),
                source='whatsapp',
            )

            self.ticket_messages.create(
                ticket_id=ticket.id,
                content=draft.get('description') or draft.get('subject', ''),
                from_whatsapp=True,
            )

            session.ticket_draft = None
            session.state = 'COMPLETED'

            return (
                f'Your ticket has been created!\n\n'
                f'Ticket Number: {ticket.ticket_number}\n'
                f'Status: Open\n\n'
                f'We will get back to you as soon as possible.\n'
                f'Send any message to return to the main menu.'
            )

        if choice == '2':
            session.state = 'WAITING_DESCRIPTION'
            return 'Please describe your issue again:'

        if choice == '3':
            session.ticket_draft = None
            session.state = 'MAIN_MENU'
            return f'Cancelled.\n\n{MAIN_MENU_TEXT}'

        return (
            'Please choose a valid option:\n\n'
            '1. Submit\n'
            '2. Edit Description\n'
            '3. Cancel'
        )

    def _handle_check_ticket(self, session: WhatsappSession, text: str, tenant_id: uuid.UUID) -> str:
        ticket_number = text.strip().upper()
        ticket = self.tickets.get_by_number(ticket_number, tenant_id)

        if not ticket:
            return (
                f'Ticket "{ticket_number}" was not found.\n\n'
                'Please check the number and try again, or send 0 to return to menu.'
            )

        session.state = 'COMPLETED'

        return (
            f'Ticket {ticket.ticket_number}\n'
            f'Status: {ticket.status}\n'
            f'Subject: {ticket.subject}\n'
            f'Category: {ticket.category or "N/A"}\n'
            f'Created: {ticket.created_at.strftime("%Y-%m-%d %H:%M")}\n\n'
            f'Send any message to return to the main menu.'
        )
