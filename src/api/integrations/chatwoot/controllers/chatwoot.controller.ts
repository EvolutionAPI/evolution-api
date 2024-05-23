import { isURL } from 'class-validator';

import { CacheEngine } from '../../../../cache/cacheengine';
import { ConfigService, HttpServer } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { BadRequestException } from '../../../../exceptions';
import { InstanceDto } from '../../../dto/instance.dto';
import { RepositoryBroker } from '../../../repository/repository.manager';
import { waMonitor } from '../../../server.module';
import { CacheService } from '../../../services/cache.service';
import { ChatwootDto } from '../dto/chatwoot.dto';
import { ChatwootService } from '../services/chatwoot.service';

const logger = new Logger('ChatwootController');

export class ChatwootController {
  constructor(
    private readonly chatwootService: ChatwootService,
    private readonly configService: ConfigService,
    private readonly repository: RepositoryBroker,
  ) {}

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
      if (data.sign_msg === false) data.sign_delimiter = null;
    }

    if (!data.enabled) {
      logger.verbose('chatwoot disabled');
      data.account_id = '';
      data.token = '';
      data.url = '';
      data.sign_msg = false;
      data.sign_delimiter = null;
      data.reopen_conversation = false;
      data.conversation_pending = false;
      data.import_contacts = false;
      data.import_messages = false;
      data.merge_brazil_contacts = false;
      data.days_limit_import_messages = 0;
      data.auto_create = false;
      data.name_inbox = '';
    }

    if (!data.name_inbox || data.name_inbox === '') {
      data.name_inbox = instance.instanceName;
    }

    const result = await this.chatwootService.create(instance, data);

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

    if (Object.keys(result || {}).length === 0) {
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

    const chatwootCache = new CacheService(new CacheEngine(this.configService, ChatwootService.name).getEngine());
    const chatwootService = new ChatwootService(waMonitor, this.configService, this.repository, chatwootCache);

    return chatwootService.receiveWebhook(instance, data);
  }
}
