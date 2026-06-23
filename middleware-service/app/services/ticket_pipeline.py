from app.services.ticket_event_publisher import TicketEventPublisher


async def publish_ticket_result(publisher: TicketEventPublisher, result: dict | None):
    if not result:
        return

    action = result.get('action')
    ticket = result.get('ticket')
    comment = result.get('comment')

    if action == 'ticket_created' and ticket:
        await publisher.ticket_created(ticket)
        if comment:
            await publisher.comment_added(ticket, comment)
    elif action == 'comment_added' and ticket and comment:
        await publisher.comment_added(ticket, comment)
    elif action in {'status_changed', 'ticket_closed'} and ticket:
        await publisher.status_changed(ticket)


def summarize_ticket_result(result: dict | None) -> dict | None:
    if not result:
        return None

    summary = {'action': result.get('action')}
    ticket = result.get('ticket')
    comment = result.get('comment')

    if ticket:
        summary['ticket_id'] = str(ticket.id)
        summary['ticket_number'] = ticket.ticket_number
    if comment:
        summary['comment_id'] = str(comment.id)
    if result.get('error'):
        summary['error'] = result['error']
    if result.get('reason'):
        summary['reason'] = result['reason']
    if result.get('tickets') is not None:
        summary['tickets'] = [ticket.ticket_number for ticket in result['tickets']]

    return summary
