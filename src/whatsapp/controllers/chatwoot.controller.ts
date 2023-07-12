import { isURL } from 'class-validator';
import { BadRequestException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
import { ChatwootDto } from '../dto/chatwoot.dto';
import { ChatwootService } from '../services/chatwoot.service';
import { Logger } from '../../config/logger.config';

const logger = new Logger('ChatwootController');

export class ChatwootController {
  constructor(private readonly chatwootService: ChatwootService) {}

  public async createChatwoot(instance: InstanceDto, data: ChatwootDto) {
    logger.verbose(
      'requested createChatwoot from ' + instance.instanceName + ' instance',
    );

    if (data.enabled) {
      if (!isURL(data.url, { require_tld: false })) {
        throw new BadRequestException('url is not valid');
      }

      if (!data.account_id) {
        throw new BadRequestException('account_id is required');
      }

      if (!data.token) {
        throw new BadRequestException('token is required');
      }
    }

    if (!data.enabled) {
      logger.verbose('chatwoot disabled');
      data.account_id = '';
      data.token = '';
      data.url = '';
    }

    data.name_inbox = instance.instanceName;

    return this.chatwootService.create(instance, data);
  }

  public async findChatwoot(instance: InstanceDto) {
    logger.verbose('requested findChatwoot from ' + instance.instanceName + ' instance');
    return this.chatwootService.find(instance);
  }

  public async receiveWebhook(instance: InstanceDto, data: any) {
    logger.verbose(
      'requested receiveWebhook from ' + instance.instanceName + ' instance',
    );
    return this.chatwootService.receiveWebhook(instance, data);
  }
}
