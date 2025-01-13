import { Logger } from '@config/logger.config';
import { InstanceDto } from '@api/dto/instance.dto';
import { ChatwootDto } from '@api/integrations/chatbot/chatwoot/dto/chatwoot.dto';
import { ChatwootService } from '@api/integrations/chatbot/chatwoot/services/chatwoot.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { waMonitor } from '@api/server.module';
import { CacheService } from '@api/services/cache.service';
import { CacheEngine } from '@cache/cacheengine';
import { Chatwoot, ConfigService, HttpServer } from '@config/env.config';
import { BadRequestException } from '@exceptions';
import { isURL } from 'class-validator';

export class ChatwootController {
  private readonly logger = new Logger(ChatwootController.name);

  constructor(
    private readonly chatwootService: ChatwootService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  public async createChatwoot(instance: InstanceDto, data: ChatwootDto) {
    this.logger.debug(`[createChatwoot] Iniciando criação de Chatwoot para a instância: ${JSON.stringify(instance)}`);
    this.logger.debug(`[createChatwoot] Dados recebidos: ${JSON.stringify(data)}`);

    const chatwootConfig = this.configService.get<Chatwoot>('CHATWOOT');
    if (!chatwootConfig.ENABLED) {
      this.logger.warn('[createChatwoot] Chatwoot está desabilitado. Lançando exceção...');
      throw new BadRequestException('Chatwoot is disabled');
    }

    if (data?.enabled) {
      this.logger.debug('[createChatwoot] Validação de dados habilitados...');
      
      if (!isURL(data.url, { require_tld: false })) {
        this.logger.error(`[createChatwoot] URL inválida: ${data.url}`);
        throw new BadRequestException('url is not valid');
      }

      if (!data.accountId) {
        this.logger.error('[createChatwoot] accountId não informado');
        throw new BadRequestException('accountId is required');
      }

      if (!data.token) {
        this.logger.error('[createChatwoot] token não informado');
        throw new BadRequestException('token is required');
      }

      if (data.signMsg !== true && data.signMsg !== false) {
        this.logger.error('[createChatwoot] signMsg inválido ou não informado');
        throw new BadRequestException('signMsg is required');
      }

      if (data.signMsg === false) {
        this.logger.debug('[createChatwoot] signMsg definido como false, removendo signDelimiter');
        data.signDelimiter = null;
      }
    } else {
      this.logger.debug('[createChatwoot] Dados informam que Chatwoot não está habilitado (enabled=false ou undefined).');
    }

    if (!data.nameInbox || data.nameInbox === '') {
      this.logger.debug(`[createChatwoot] nameInbox não informado. Usando nome da instância: "${instance.instanceName}"`);
      data.nameInbox = instance.instanceName;
    }

    this.logger.debug('[createChatwoot] Chamando ChatwootService.create...');
    const result = await this.chatwootService.create(instance, data);
    this.logger.debug(`[createChatwoot] Retorno de ChatwootService.create: ${JSON.stringify(result)}`);

    const urlServer = this.configService.get<HttpServer>('SERVER').URL;
    this.logger.debug(`[createChatwoot] urlServer obtido: ${urlServer}`);

    const response = {
      ...result,
      webhook_url: `${urlServer}/chatwoot/webhook/${encodeURIComponent(instance.instanceName)}`,
    };

    this.logger.debug(`[createChatwoot] Retornando resposta final: ${JSON.stringify(response)}`);
    return response;
  }

  public async findChatwoot(instance: InstanceDto): Promise<ChatwootDto & { webhook_url: string }> {
    this.logger.debug(`[findChatwoot] Buscando configurações Chatwoot para a instância: ${JSON.stringify(instance)}`);

    const chatwootConfig = this.configService.get<Chatwoot>('CHATWOOT');
    if (!chatwootConfig.ENABLED) {
      this.logger.warn('[findChatwoot] Chatwoot está desabilitado. Lançando exceção...');
      throw new BadRequestException('Chatwoot is disabled');
    }

    this.logger.debug('[findChatwoot] Chamando ChatwootService.find...');
    const result = await this.chatwootService.find(instance);
    this.logger.debug(`[findChatwoot] Resposta de ChatwootService.find: ${JSON.stringify(result)}`);

    const urlServer = this.configService.get<HttpServer>('SERVER').URL;
    this.logger.debug(`[findChatwoot] urlServer obtido: ${urlServer}`);

    if (Object.keys(result || {}).length === 0) {
      this.logger.debug('[findChatwoot] Nenhuma configuração encontrada. Retornando default desabilitado.');
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

    this.logger.debug(`[findChatwoot] Resposta final: ${JSON.stringify(response)}`);
    return response;
  }

  public async receiveWebhook(instance: InstanceDto, data: any) {
    this.logger.debug(`[receiveWebhook] Recebendo webhook para instância: ${JSON.stringify(instance)}`);
    this.logger.debug(`[receiveWebhook] Dados recebidos no webhook: ${JSON.stringify(data)}`);

    const chatwootConfig = this.configService.get<Chatwoot>('CHATWOOT');
    if (!chatwootConfig.ENABLED) {
      this.logger.warn('[receiveWebhook] Chatwoot está desabilitado. Lançando exceção...');
      throw new BadRequestException('Chatwoot is disabled');
    }

    this.logger.debug('[receiveWebhook] Iniciando configuração de CacheService para Chatwoot...');
    const chatwootCache = new CacheService(new CacheEngine(this.configService, ChatwootService.name).getEngine());
    const chatwootService = new ChatwootService(waMonitor, this.configService, this.prismaRepository, chatwootCache);

    this.logger.debug('[receiveWebhook] Chamando chatwootService.receiveWebhook...');
    const result = await chatwootService.receiveWebhook(instance, data);
    this.logger.debug(`[receiveWebhook] Resposta de receiveWebhook: ${JSON.stringify(result)}`);

    return result;
  }
}
