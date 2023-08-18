import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { RabbitmqDto } from '../dto/rabbitmq.dto';
import { RabbitmqService } from '../services/rabbitmq.service';

const logger = new Logger('RabbitmqController');

export class RabbitmqController {
  constructor(private readonly rabbitmqService: RabbitmqService) {}

  public async createRabbitmq(instance: InstanceDto, data: RabbitmqDto) {
    logger.verbose('requested createRabbitmq from ' + instance.instanceName + ' instance');

    if (!data.enabled) {
      logger.verbose('rabbitmq disabled');
      data.events = [];
    }

    if (data.events.length === 0) {
      logger.verbose('rabbitmq events empty');
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
        'CALL',
        'NEW_JWT_TOKEN',
      ];
    }

    return this.rabbitmqService.create(instance, data);
  }

  public async findRabbitmq(instance: InstanceDto) {
    logger.verbose('requested findRabbitmq from ' + instance.instanceName + ' instance');
    return this.rabbitmqService.find(instance);
  }
}
