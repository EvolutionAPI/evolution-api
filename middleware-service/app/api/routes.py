from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.comments import router as comments_router
from app.api.customers import router as customers_router
from app.api.instances import router as instances_router
from app.api.tenants import router as tenants_router
from app.api.ticket_messages import router as ticket_messages_router
from app.api.tickets import router as tickets_router
from app.api.webhook import router as webhook_router
from app.core.config import settings
from app.db.session import get_db
from app.schemas.events import IncomingEvent, PublishMessage
from app.schemas.evolution import RabbitMQInstanceConfig
from app.services.evolution_api import EvolutionAPIService
from app.services.rabbitmq import RabbitMQService
from app.repositories import EventLogRepository
from app.services.ticket_event_publisher import TicketEventPublisher
from app.services.ticket_pipeline import publish_ticket_result, summarize_ticket_result
from app.services.ticket_service import TicketService


def get_router(rabbitmq: RabbitMQService) -> APIRouter:
    router = APIRouter()
    evolution_api = EvolutionAPIService()

    router.include_router(tenants_router)
    router.include_router(customers_router)
    router.include_router(tickets_router)
    router.include_router(ticket_messages_router)
    router.include_router(comments_router)
    router.include_router(instances_router)
    router.include_router(webhook_router)

    @router.get('/health')
    async def health_check():
        return {'status': 'ok', 'service': settings.app_name}

    @router.get('/evolution/info')
    async def evolution_info():
        try:
            return await evolution_api.get_information()
        except Exception as error:
            raise HTTPException(status_code=502, detail=f'Failed to fetch Evolution info: {error}') from error

    @router.post('/evolution/rabbitmq/set/{instance_name}')
    async def configure_evolution_rabbitmq(instance_name: str, config: RabbitMQInstanceConfig):
        try:
            response = await evolution_api.set_instance_rabbitmq(instance_name, config.model_dump())
            return {'message': 'RabbitMQ configured on Evolution instance', 'instance': instance_name, 'response': response}
        except Exception as error:
            raise HTTPException(status_code=502, detail=f'Failed to configure Evolution RabbitMQ: {error}') from error

    @router.post('/events/evolution')
    async def receive_evolution_event(data: IncomingEvent, db: Session = Depends(get_db)):
        repo = EventLogRepository(db)
        event = repo.create(source='evolution', event_type=data.event_type, payload=data.payload)

        ticket_result = TicketService(db).process_evolution_payload(data.payload)
        if ticket_result:
            await publish_ticket_result(TicketEventPublisher(rabbitmq), ticket_result)

        await rabbitmq.publish(
            payload={'source': 'evolution', 'event_type': data.event_type, 'payload': data.payload, 'event_id': event.id},
            routing_key=settings.rabbitmq_routing_key_out,
        )

        return {
            'message': 'Event received and processed',
            'event_id': event.id,
            'ticket_result': summarize_ticket_result(ticket_result),
        }

    @router.post('/events/helpdesk')
    async def receive_helpdesk_event(data: IncomingEvent, db: Session = Depends(get_db)):
        repo = EventLogRepository(db)
        event = repo.create(source='helpdesk', event_type=data.event_type, payload=data.payload)

        await rabbitmq.publish(
            payload={'source': 'helpdesk', 'event_type': data.event_type, 'payload': data.payload, 'event_id': event.id},
            routing_key=settings.rabbitmq_routing_key_in,
        )

        return {'message': 'Helpdesk event received and sent to queue', 'event_id': event.id}

    @router.post('/publish')
    async def publish_message(data: PublishMessage):
        routing_key = data.routing_key or settings.rabbitmq_routing_key_out
        await rabbitmq.publish(payload=data.message, routing_key=routing_key)
        return {'message': 'Message published', 'routing_key': routing_key}

    return router
