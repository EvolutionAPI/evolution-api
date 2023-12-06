import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { OpenaiDto } from '../dto/openai.dto';
import { ContactOpenaiDto } from '../dto/contactopenai.dto';
import { OpenaiService } from '../services/openai.service';

const logger = new Logger('OpenaiController');

export class OpenaiController {
  constructor(private readonly openaiService: OpenaiService) {}

  public async createOpenai(instance: InstanceDto, data: OpenaiDto) {
    logger.verbose('requested createOpenai from ' + instance.instanceName + ' instance');

    if (!data.chave) {
      logger.verbose('openai sem chave');
      data.chave = '';
    }

    if (!data.enabled) {
      logger.verbose('openai disabled');
      data.events = [];
    }

    if (data.events?.length === 0) {
      logger.verbose('openai events empty');
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
        'TYPEBOT_START',
        'TYPEBOT_CHANGE_STATUS',
        'CHAMA_AI_ACTION',
      ];
    }

    return this.openaiService.create(instance, data);
  }

  public async findOpenai(instance: InstanceDto) {
    logger.verbose('requested findOpenai from ' + instance.instanceName + ' instance');
    return this.openaiService.find(instance);
  }

  public async createContactOpenai(instance: InstanceDto, data: ContactOpenaiDto) {
    logger.verbose('requested createOpenai from ' + instance.instanceName + ' instance');

    if (!data.contact) {
      logger.verbose('openai sem chave');
      data.contact = '';
    }

    if (!data.enabled) {
      logger.verbose('openai disabled');
      data.enabled = false;
    }

    data.owner = instance.instanceName;

    return this.openaiService.createContact(instance, data);
  }

  public async findContactOpenai(instance: InstanceDto) {
    logger.verbose('requested findOpenai from ' + instance.instanceName + ' instance');
    return this.openaiService.findContact(instance);
  }
}
