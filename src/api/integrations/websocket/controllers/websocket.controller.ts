import { InstanceDto } from '../../../dto/instance.dto';
import { WebsocketDto } from '../dto/websocket.dto';
import { WebsocketService } from '../services/websocket.service';

export class WebsocketController {
  constructor(private readonly websocketService: WebsocketService) {}

  public async createWebsocket(instance: InstanceDto, data: WebsocketDto) {
    if (!data.enabled) {
      data.events = [];
    }

    if (data.events.length === 0) {
      data.events = [
        'APPLICATION_STARTUP',
        'QRCODE_UPDATED',
        'MESSAGES_SET',
        'MESSAGES_UPSERT',
        'MESSAGES_EDITED',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE',
        'CONTACTS_SET',
        'CONTACTS_UPSERT',
        'CONTACTS_UPDATE',
        'PRESENCE_UPDATE',
        'CHATS_SET',
        'CHATS_UPSERT',
        'CHATS_UPDATE',
        'CHATS_DELETE',
        'GROUPS_UPSERT',
        'GROUP_UPDATE',
        'GROUP_PARTICIPANTS_UPDATE',
        'CONNECTION_UPDATE',
        'LABELS_EDIT',
        'LABELS_ASSOCIATION',
        'CALL',
        'TYPEBOT_START',
        'TYPEBOT_CHANGE_STATUS',
      ];
    }

    return this.websocketService.create(instance, data);
  }

  public async findWebsocket(instance: InstanceDto) {
    return this.websocketService.find(instance);
  }
}
