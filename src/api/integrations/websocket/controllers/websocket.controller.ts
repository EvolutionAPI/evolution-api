import { Logger } from '../../../../config/logger.config';
import { InstanceDto } from '../../../dto/instance.dto';
import { WebsocketDto } from '../dto/websocket.dto';
import { WebsocketService } from '../services/websocket.service';

const logger = new Logger('WebsocketController');

export class WebsocketController {
  constructor(private readonly websocketService: WebsocketService) {}

  public async createWebsocket(instance: InstanceDto, data: WebsocketDto) {
    logger.verbose('requested createWebsocket from ' + instance.instanceName + ' instance');

    if (!data.enabled) {
      logger.verbose('websocket disabled');
      data.events = [];
    }

    if (data.events.length === 0) {
      logger.verbose('websocket events empty');
      data.events = [
        'APPLICATION_STARTUP',
        'QRCODE_UPDATED',
        'MESSAGES_SET',
        'MESSAGES_UPSERT',
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
        'NEW_JWT_TOKEN',
        'TYPEBOT_START',
        'TYPEBOT_CHANGE_STATUS',
        'CHAMA_AI_ACTION',
      ];
    }

    return this.websocketService.create(instance, data);
  }

  public async findWebsocket(instance: InstanceDto) {
    logger.verbose('requested findWebsocket from ' + instance.instanceName + ' instance');
    return this.websocketService.find(instance);
  }
}
