import { Logger } from '../../../../config/logger.config';
import { InstanceDto } from '../../../dto/instance.dto';
import { SqsDto } from '../dto/sqs.dto';
import { SqsService } from '../services/sqs.service';

const logger = new Logger('SqsController');

export class SqsController {
  constructor(private readonly sqsService: SqsService) {}

  public async createSqs(instance: InstanceDto, data: SqsDto) {
    logger.verbose('requested createSqs from ' + instance.instanceName + ' instance');

    if (!data.enabled) {
      logger.verbose('sqs disabled');
      data.events = [];
    }

    if (data.events.length === 0) {
      logger.verbose('sqs events empty');
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

    return this.sqsService.create(instance, data);
  }

  public async findSqs(instance: InstanceDto) {
    logger.verbose('requested findSqs from ' + instance.instanceName + ' instance');
    return this.sqsService.find(instance);
  }
}
