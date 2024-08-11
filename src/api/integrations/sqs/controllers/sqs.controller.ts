import { InstanceDto } from '@api/dto/instance.dto';
import { SqsDto } from '@api/integrations/sqs/dto/sqs.dto';
import { SqsService } from '@api/integrations/sqs/services/sqs.service';
import { configService, Sqs } from '@config/env.config';
import { BadRequestException } from '@exceptions';

export class SqsController {
  constructor(private readonly sqsService: SqsService) {}

  public async createSqs(instance: InstanceDto, data: SqsDto) {
    if (!configService.get<Sqs>('SQS').ENABLED) throw new BadRequestException('Sqs is disabled');

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

    return this.sqsService.create(instance, data);
  }

  public async findSqs(instance: InstanceDto) {
    return this.sqsService.find(instance);
  }
}
