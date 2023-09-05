import { isURL } from 'class-validator';

import { ConfigService, HttpServer } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { BadRequestException } from '../../exceptions';
import { ChatwootDto } from '../dto/chatwoot.dto';
import { InstanceDto } from '../dto/instance.dto';
import { ChatwootService } from '../services/chatwoot.service';
import { waMonitor } from '../whatsapp.module';

const logger = new Logger('ChatwootController');

export class ChatwootController {
  constructor(private readonly chatwootService: ChatwootService, private readonly configService: ConfigService) {}

  public async createChatwoot(instance: InstanceDto, data: ChatwootDto) {
    logger.verbose('requested createChatwoot from ' + instance.instanceName + ' instance');

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

      if (data.sign_msg !== true && data.sign_msg !== false) {
        throw new BadRequestException('sign_msg is required');
      }
    }

    if (!data.enabled) {
      logger.verbose('chatwoot disabled');
      data.account_id = '';
      data.token = '';
      data.url = '';
      data.sign_msg = false;
      data.reopen_conversation = false;
      data.conversation_pending = false;
    }

    data.name_inbox = instance.instanceName;

    const result = this.chatwootService.create(instance, data);

    const urlServer = this.configService.get<HttpServer>('SERVER').URL;

    const response = {
      ...result,
      webhook_url: `${urlServer}/chatwoot/webhook/${encodeURIComponent(instance.instanceName)}`,
    };

    return response;
  }

  public async findChatwoot(instance: InstanceDto) {
    logger.verbose('requested findChatwoot from ' + instance.instanceName + ' instance');
    const result = await this.chatwootService.find(instance);

    const urlServer = this.configService.get<HttpServer>('SERVER').URL;

    if (Object.keys(result).length === 0) {
      return {
        enabled: false,
        url: '',
        account_id: '',
        token: '',
        sign_msg: false,
        name_inbox: '',
        webhook_url: '',
      };
    }

    const response = {
      ...result,
      webhook_url: `${urlServer}/chatwoot/webhook/${encodeURIComponent(instance.instanceName)}`,
    };

    return response;
  }

  public async receiveWebhook(instance: InstanceDto, data: any) {
    logger.verbose('requested receiveWebhook from ' + instance.instanceName + ' instance');
    const chatwootService = new ChatwootService(waMonitor, this.configService);

    return chatwootService.receiveWebhook(instance, data);
  }
}
