import { isURL } from 'class-validator';

import { CacheEngine } from '../../../../cache/cacheengine';
import { Chatwoot, ConfigService, HttpServer } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { BadRequestException } from '../../../../exceptions';
import { InstanceDto } from '../../../dto/instance.dto';
import { PrismaRepository } from '../../../repository/repository.service';
import { waMonitor } from '../../../server.module';
import { CacheService } from '../../../services/cache.service';
import { ChatwootDto } from '../dto/chatwoot.dto';
import { ChatwootService } from '../services/chatwoot.service';

const logger = new Logger('ChatwootController');

export class ChatwootController {
  constructor(
    private readonly chatwootService: ChatwootService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  public async createChatwoot(instance: InstanceDto, data: ChatwootDto) {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) throw new BadRequestException('Chatwoot is disabled');

    logger.verbose('requested createChatwoot from ' + instance.instanceName + ' instance');

    if (data.enabled) {
      if (!isURL(data.url, { require_tld: false })) {
        throw new BadRequestException('url is not valid');
      }

      if (!data.accountId) {
        throw new BadRequestException('accountId is required');
      }

      if (!data.token) {
        throw new BadRequestException('token is required');
      }

      if (data.signMsg !== true && data.signMsg !== false) {
        throw new BadRequestException('signMsg is required');
      }
      if (data.signMsg === false) data.signDelimiter = null;
    }

    if (!data.enabled) {
      logger.verbose('chatwoot disabled');
      data.accountId = '';
      data.token = '';
      data.url = '';
      data.signMsg = false;
      data.signDelimiter = null;
      data.reopenConversation = false;
      data.conversationPending = false;
      data.importContacts = false;
      data.importMessages = false;
      data.mergeBrazilContacts = false;
      data.daysLimitImportMessages = 0;
      data.autoCreate = false;
      data.nameInbox = '';
    }

    if (!data.nameInbox || data.nameInbox === '') {
      data.nameInbox = instance.instanceName;
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
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) throw new BadRequestException('Chatwoot is disabled');

    logger.verbose('requested findChatwoot from ' + instance.instanceName + ' instance');
    const result = await this.chatwootService.find(instance);

    const urlServer = this.configService.get<HttpServer>('SERVER').URL;

    if (Object.keys(result || {}).length === 0) {
      return {
        enabled: false,
        url: '',
        accountId: '',
        token: '',
        signMsg: false,
        nameInbox: '',
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
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) throw new BadRequestException('Chatwoot is disabled');

    logger.verbose('requested receiveWebhook from ' + instance.instanceName + ' instance');

    const chatwootCache = new CacheService(new CacheEngine(this.configService, ChatwootService.name).getEngine());
    const chatwootService = new ChatwootService(waMonitor, this.configService, this.prismaRepository, chatwootCache);

    return chatwootService.receiveWebhook(instance, data);
  }
}
