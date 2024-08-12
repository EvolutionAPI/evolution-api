import { InstanceDto } from '@api/dto/instance.dto';
import { RabbitmqDto } from '@api/integrations/rabbitmq/dto/rabbitmq.dto';
import { RabbitmqService } from '@api/integrations/rabbitmq/services/rabbitmq.service';
import { configService, Rabbitmq } from '@config/env.config';
import { BadRequestException } from '@exceptions';

export class RabbitmqController {
  constructor(private readonly rabbitmqService: RabbitmqService) {}

  public async createRabbitmq(instance: InstanceDto, data: RabbitmqDto) {
    if (!configService.get<Rabbitmq>('RABBITMQ').ENABLED) throw new BadRequestException('Rabbitmq is disabled');

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

    return this.rabbitmqService.create(instance, data);
  }

  public async findRabbitmq(instance: InstanceDto) {
    return this.rabbitmqService.find(instance);
  }
}
