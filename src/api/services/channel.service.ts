import { WASocket } from '@whiskeysockets/baileys';
import axios from 'axios';
import { execSync } from 'child_process';
import { isURL } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import { join } from 'path';
import { v4 } from 'uuid';

import {
  Auth,
  CleanStoreConf,
  ConfigService,
  Database,
  HttpServer,
  Log,
  Rabbitmq,
  Sqs,
  Webhook,
  Websocket,
} from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { ROOT_DIR } from '../../config/path.config';
import { NotFoundException } from '../../exceptions';
import { IntegrationDto } from '../dto/integration.dto';
import { ProxyDto } from '../dto/proxy.dto';
import { SettingsDto } from '../dto/settings.dto';
import { WebhookDto } from '../dto/webhook.dto';
import { ChatwootDto } from '../integrations/chatwoot/dto/chatwoot.dto';
import { ChatwootService } from '../integrations/chatwoot/services/chatwoot.service';
import { RabbitmqDto } from '../integrations/rabbitmq/dto/rabbitmq.dto';
import { getAMQP, removeQueues } from '../integrations/rabbitmq/libs/amqp.server';
import { SqsDto } from '../integrations/sqs/dto/sqs.dto';
import { getSQS, removeQueues as removeQueuesSQS } from '../integrations/sqs/libs/sqs.server';
import { TypebotDto } from '../integrations/typebot/dto/typebot.dto';
import { TypebotService } from '../integrations/typebot/services/typebot.service';
import { WebsocketDto } from '../integrations/websocket/dto/websocket.dto';
import { getIO } from '../integrations/websocket/libs/socket.server';
import { PrismaRepository } from '../repository/repository.service';
import { waMonitor } from '../server.module';
import { Events, wa } from '../types/wa.types';
import { CacheService } from './cache.service';

export class ChannelStartupService {
  constructor(
    public readonly configService: ConfigService,
    public readonly eventEmitter: EventEmitter2,
    public readonly prismaRepository: PrismaRepository,
    public readonly chatwootCache: CacheService,
  ) {
    this.logger.verbose('ChannelStartupService initialized');
  }

  public readonly logger = new Logger(ChannelStartupService.name);

  public client: WASocket;
  public readonly instance: wa.Instance = {};
  public readonly localWebhook: wa.LocalWebHook = {};
  public readonly localChatwoot: wa.LocalChatwoot = {};
  public readonly localWebsocket: wa.LocalWebsocket = {};
  public readonly localRabbitmq: wa.LocalRabbitmq = {};
  public readonly localSqs: wa.LocalSqs = {};
  public readonly localTypebot: wa.LocalTypebot = {};
  public readonly localProxy: wa.LocalProxy = {};
  public readonly localIntegration: wa.LocalIntegration = {};
  public readonly localSettings: wa.LocalSettings = {};
  public readonly storePath = join(ROOT_DIR, 'store');

  public chatwootService = new ChatwootService(
    waMonitor,
    this.configService,
    this.prismaRepository,
    this.chatwootCache,
  );

  public typebotService = new TypebotService(waMonitor, this.configService, this.eventEmitter);

  public set instanceName(name: string) {
    this.logger.setInstance(name);

    this.logger.verbose(`Initializing instance '${name}'`);
    if (!name) {
      this.logger.verbose('Instance name not found, generating random name with uuid');
      this.instance.name = v4();
      return;
    }
    this.instance.name = name;
    this.logger.verbose(`Instance '${this.instance.name}' initialized`);
    this.logger.verbose('Sending instance status to webhook');
    this.sendDataWebhook(Events.STATUS_INSTANCE, {
      instance: this.instance.name,
      status: 'created',
    });

    if (this.localChatwoot.enabled) {
      this.chatwootService.eventWhatsapp(
        Events.STATUS_INSTANCE,
        { instanceName: this.instance.name },
        {
          instance: this.instance.name,
          status: 'created',
        },
      );
    }
  }

  public get instanceName() {
    this.logger.verbose('Getting instance name');
    return this.instance.name;
  }

  public set instanceId(id: string) {
    if (!id) {
      this.logger.verbose('Instance id not found, generating random id with uuid');
      this.instance.id = v4();
      return;
    }
    this.logger.verbose(`Setting instanceId: ${id}`);
    this.instance.id = id;
  }

  public get instanceId() {
    this.logger.verbose('Getting instanceId');
    return this.instance.id;
  }

  public get wuid() {
    this.logger.verbose('Getting remoteJid of instance');
    return this.instance.wuid;
  }

  public async loadIntegration() {
    this.logger.verbose('Loading webhook');
    const data = await this.prismaRepository.integration.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localIntegration.integration = data?.integration;
    this.logger.verbose(`Integration: ${this.localIntegration.integration}`);

    this.localIntegration.number = data?.number;
    this.logger.verbose(`Integration number: ${this.localIntegration.number}`);

    this.localIntegration.token = data?.token;
    this.logger.verbose(`Integration token: ${this.localIntegration.token}`);

    this.logger.verbose('Integration loaded');
  }

  public async setIntegration(data: IntegrationDto) {
    this.logger.verbose('Setting integration');
    console.log('setIntegration');
    await this.prismaRepository.integration.upsert({
      where: {
        instanceId: this.instanceId,
      },
      update: {
        integration: data.integration,
        number: data.number,
        token: data.token,
      },
      create: {
        integration: data.integration,
        number: data.number,
        token: data.token,
        instanceId: this.instanceId,
      },
    });

    this.logger.verbose(`Integration: ${data.integration}`);
    this.logger.verbose(`Integration number: ${data.number}`);
    this.logger.verbose(`Integration token: ${data.token}`);
    Object.assign(this.localIntegration, data);
    this.logger.verbose('Integration set');
  }

  public async findIntegration() {
    this.logger.verbose('Finding integration');
    let data;

    data = await this.prismaRepository.integration.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      await this.prismaRepository.integration.create({
        data: {
          integration: 'WHATSAPP-BAILEYS',
          number: '',
          token: '',
          instanceId: this.instanceId,
        },
      });
      data = { integration: 'WHATSAPP-BAILEYS', number: '', token: '' };
    }

    this.logger.verbose(`Integration: ${data.integration}`);
    this.logger.verbose(`Integration number: ${data.number}`);
    this.logger.verbose(`Integration token: ${data.token}`);

    return data;
  }

  public async loadSettings() {
    this.logger.verbose('Loading settings');
    const data = await this.prismaRepository.setting.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localSettings.rejectCall = data?.rejectCall;
    this.logger.verbose(`Settings rejectCall: ${this.localSettings.rejectCall}`);

    this.localSettings.msgCall = data?.msgCall;
    this.logger.verbose(`Settings msgCall: ${this.localSettings.msgCall}`);

    this.localSettings.groupsIgnore = data?.groupsIgnore;
    this.logger.verbose(`Settings groupsIgnore: ${this.localSettings.groupsIgnore}`);

    this.localSettings.alwaysOnline = data?.alwaysOnline;
    this.logger.verbose(`Settings alwaysOnline: ${this.localSettings.alwaysOnline}`);

    this.localSettings.readMessages = data?.readMessages;
    this.logger.verbose(`Settings readMessages: ${this.localSettings.readMessages}`);

    this.localSettings.readStatus = data?.readStatus;
    this.logger.verbose(`Settings readStatus: ${this.localSettings.readStatus}`);

    this.localSettings.syncFullHistory = data?.syncFullHistory;
    this.logger.verbose(`Settings syncFullHistory: ${this.localSettings.syncFullHistory}`);

    this.logger.verbose('Settings loaded');
  }

  public async setSettings(data: SettingsDto) {
    this.logger.verbose('Setting settings');
    await this.prismaRepository.setting.create({
      data: {
        rejectCall: data.rejectCall,
        msgCall: data.msgCall,
        groupsIgnore: data.groupsIgnore,
        alwaysOnline: data.alwaysOnline,
        readMessages: data.readMessages,
        readStatus: data.readStatus,
        syncFullHistory: data.syncFullHistory,
        instanceId: this.instanceId,
      },
    });

    this.logger.verbose(`Settings rejectCall: ${data.rejectCall}`);
    this.logger.verbose(`Settings msgCall: ${data.msgCall}`);
    this.logger.verbose(`Settings groupsIgnore: ${data.groupsIgnore}`);
    this.logger.verbose(`Settings alwaysOnline: ${data.alwaysOnline}`);
    this.logger.verbose(`Settings readMessages: ${data.readMessages}`);
    this.logger.verbose(`Settings readStatus: ${data.readStatus}`);
    this.logger.verbose(`Settings syncFullHistory: ${data.syncFullHistory}`);
    Object.assign(this.localSettings, data);
    this.logger.verbose('Settings set');
  }

  public async findSettings() {
    this.logger.verbose('Finding settings');
    const data = await this.prismaRepository.setting.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      this.logger.verbose('Settings not found');
      return null;
    }

    this.logger.verbose(`Settings url: ${data.rejectCall}`);
    this.logger.verbose(`Settings msgCall: ${data.msgCall}`);
    this.logger.verbose(`Settings groupsIgnore: ${data.groupsIgnore}`);
    this.logger.verbose(`Settings alwaysOnline: ${data.alwaysOnline}`);
    this.logger.verbose(`Settings readMessages: ${data.readMessages}`);
    this.logger.verbose(`Settings readStatus: ${data.readStatus}`);
    this.logger.verbose(`Settings syncFullHistory: ${data.syncFullHistory}`);
    return {
      rejectCall: data.rejectCall,
      msgCall: data.msgCall,
      groupsIgnore: data.groupsIgnore,
      alwaysOnline: data.alwaysOnline,
      readMessages: data.readMessages,
      readStatus: data.readStatus,
      syncFullHistory: data.syncFullHistory,
    };
  }

  public async loadWebhook() {
    this.logger.verbose('Loading webhook');
    const data = await this.prismaRepository.webhook.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localWebhook.url = data?.url;
    this.logger.verbose(`Webhook url: ${this.localWebhook.url}`);

    this.localWebhook.enabled = data?.enabled;
    this.logger.verbose(`Webhook enabled: ${this.localWebhook.enabled}`);

    this.localWebhook.events = data?.events;
    this.logger.verbose(`Webhook events: ${this.localWebhook.events}`);

    this.localWebhook.webhookByEvents = data?.webhookByEvents;
    this.logger.verbose(`Webhook by events: ${this.localWebhook.webhookByEvents}`);

    this.localWebhook.webhookBase64 = data?.webhookBase64;
    this.logger.verbose(`Webhook by webhookBase64: ${this.localWebhook.webhookBase64}`);

    this.logger.verbose('Webhook loaded');
  }

  public async setWebhook(data: WebhookDto) {
    this.logger.verbose('Setting webhook');
    await this.prismaRepository.webhook.create({
      data: {
        url: data.url,
        enabled: data.enabled,
        events: data.events,
        webhookByEvents: data.webhookByEvents,
        webhookBase64: data.webhookBase64,
        instanceId: this.instanceId,
      },
    });

    this.logger.verbose(`Webhook url: ${data.url}`);
    this.logger.verbose(`Webhook events: ${data.events}`);
    Object.assign(this.localWebhook, data);
    this.logger.verbose('Webhook set');
  }

  public async findWebhook() {
    this.logger.verbose('Finding webhook');
    const data = await this.prismaRepository.webhook.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      this.logger.verbose('Webhook not found');
      throw new NotFoundException('Webhook not found');
    }

    this.logger.verbose(`Webhook url: ${data.url}`);
    this.logger.verbose(`Webhook events: ${data.events}`);

    return data;
  }

  public async loadChatwoot() {
    this.logger.verbose('Loading chatwoot');
    const data = await this.prismaRepository.chatwoot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localChatwoot.enabled = data?.enabled;
    this.logger.verbose(`Chatwoot enabled: ${this.localChatwoot.enabled}`);

    this.localChatwoot.accountId = data?.accountId;
    this.logger.verbose(`Chatwoot account id: ${this.localChatwoot.accountId}`);

    this.localChatwoot.token = data?.token;
    this.logger.verbose(`Chatwoot token: ${this.localChatwoot.token}`);

    this.localChatwoot.url = data?.url;
    this.logger.verbose(`Chatwoot url: ${this.localChatwoot.url}`);

    this.localChatwoot.nameInbox = data?.nameInbox;
    this.logger.verbose(`Chatwoot inbox name: ${this.localChatwoot.nameInbox}`);

    this.localChatwoot.signMsg = data?.signMsg;
    this.logger.verbose(`Chatwoot sign msg: ${this.localChatwoot.signMsg}`);

    this.localChatwoot.signDelimiter = data?.signDelimiter;
    this.logger.verbose(`Chatwoot sign delimiter: ${this.localChatwoot.signDelimiter}`);

    this.localChatwoot.number = data?.number;
    this.logger.verbose(`Chatwoot number: ${this.localChatwoot.number}`);

    this.localChatwoot.reopenConversation = data?.reopenConversation;
    this.logger.verbose(`Chatwoot reopen conversation: ${this.localChatwoot.reopenConversation}`);

    this.localChatwoot.conversationPending = data?.conversationPending;
    this.logger.verbose(`Chatwoot conversation pending: ${this.localChatwoot.conversationPending}`);

    this.localChatwoot.mergeBrazilContacts = data?.mergeBrazilContacts;
    this.logger.verbose(`Chatwoot merge brazil contacts: ${this.localChatwoot.mergeBrazilContacts}`);

    this.localChatwoot.importContacts = data?.importContacts;
    this.logger.verbose(`Chatwoot import contacts: ${this.localChatwoot.importContacts}`);

    this.localChatwoot.importMessages = data?.importMessages;
    this.logger.verbose(`Chatwoot import messages: ${this.localChatwoot.importMessages}`);

    this.localChatwoot.daysLimitImportMessages = data?.daysLimitImportMessages;
    this.logger.verbose(`Chatwoot days limit import messages: ${this.localChatwoot.daysLimitImportMessages}`);

    this.logger.verbose('Chatwoot loaded');
  }

  public async setChatwoot(data: ChatwootDto) {
    this.logger.verbose('Setting chatwoot');
    await this.prismaRepository.chatwoot.create({
      data: {
        enabled: data.enabled,
        accountId: data.accountId,
        token: data.token,
        url: data.url,
        nameInbox: data.nameInbox,
        signMsg: data.signMsg,
        number: data.number,
        reopenConversation: data.reopenConversation,
        conversationPending: data.conversationPending,
        mergeBrazilContacts: data.mergeBrazilContacts,
        importContacts: data.importContacts,
        importMessages: data.importMessages,
        daysLimitImportMessages: data.daysLimitImportMessages,
        instanceId: this.instanceId,
      },
    });

    this.logger.verbose(`Chatwoot account id: ${data.accountId}`);
    this.logger.verbose(`Chatwoot token: ${data.token}`);
    this.logger.verbose(`Chatwoot url: ${data.url}`);
    this.logger.verbose(`Chatwoot inbox name: ${data.nameInbox}`);
    this.logger.verbose(`Chatwoot sign msg: ${data.signMsg}`);
    this.logger.verbose(`Chatwoot sign delimiter: ${data.signDelimiter}`);
    this.logger.verbose(`Chatwoot reopen conversation: ${data.reopenConversation}`);
    this.logger.verbose(`Chatwoot conversation pending: ${data.conversationPending}`);
    this.logger.verbose(`Chatwoot merge brazil contacts: ${data.mergeBrazilContacts}`);
    this.logger.verbose(`Chatwoot import contacts: ${data.importContacts}`);
    this.logger.verbose(`Chatwoot import messages: ${data.importMessages}`);
    this.logger.verbose(`Chatwoot days limit import messages: ${data.daysLimitImportMessages}`);

    Object.assign(this.localChatwoot, { ...data, signDelimiter: data.signMsg ? data.signDelimiter : null });

    this.clearCacheChatwoot();

    this.logger.verbose('Chatwoot set');
  }

  public async findChatwoot() {
    this.logger.verbose('Finding chatwoot');
    const data = await this.prismaRepository.chatwoot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      this.logger.verbose('Chatwoot not found');
      return null;
    }

    this.logger.verbose(`Chatwoot account id: ${data.accountId}`);
    this.logger.verbose(`Chatwoot token: ${data.token}`);
    this.logger.verbose(`Chatwoot url: ${data.url}`);
    this.logger.verbose(`Chatwoot inbox name: ${data.nameInbox}`);
    this.logger.verbose(`Chatwoot sign msg: ${data.signMsg}`);
    this.logger.verbose(`Chatwoot sign delimiter: ${data.signDelimiter}`);
    this.logger.verbose(`Chatwoot reopen conversation: ${data.reopenConversation}`);
    this.logger.verbose(`Chatwoot conversation pending: ${data.conversationPending}`);
    this.logger.verbose(`Chatwoot merge brazilian contacts: ${data.mergeBrazilContacts}`);
    this.logger.verbose(`Chatwoot import contacts: ${data.importContacts}`);
    this.logger.verbose(`Chatwoot import messages: ${data.importMessages}`);
    this.logger.verbose(`Chatwoot days limit import messages: ${data.daysLimitImportMessages}`);

    return {
      enabled: data.enabled,
      accountId: data.accountId,
      token: data.token,
      url: data.url,
      nameInbox: data.nameInbox,
      signMsg: data.signMsg,
      signDelimiter: data.signDelimiter || null,
      reopenConversation: data.reopenConversation,
      conversationPending: data.conversationPending,
      mergeBrazilContacts: data.mergeBrazilContacts,
      importContacts: data.importContacts,
      importMessages: data.importMessages,
      daysLimitImportMessages: data.daysLimitImportMessages,
    };
  }

  public clearCacheChatwoot() {
    this.logger.verbose('Removing cache from chatwoot');

    if (this.localChatwoot.enabled) {
      this.chatwootService.getCache()?.deleteAll(this.instanceName);
    }
  }

  public async loadWebsocket() {
    this.logger.verbose('Loading websocket');
    const data = await this.prismaRepository.websocket.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localWebsocket.enabled = data?.enabled;
    this.logger.verbose(`Websocket enabled: ${this.localWebsocket.enabled}`);

    this.localWebsocket.events = data?.events;
    this.logger.verbose(`Websocket events: ${this.localWebsocket.events}`);

    this.logger.verbose('Websocket loaded');
  }

  public async setWebsocket(data: WebsocketDto) {
    this.logger.verbose('Setting websocket');
    await this.prismaRepository.websocket.create({
      data: {
        enabled: data.enabled,
        events: data.events,
        instanceId: this.instanceId,
      },
    });

    this.logger.verbose(`Websocket events: ${data.events}`);
    Object.assign(this.localWebsocket, data);
    this.logger.verbose('Websocket set');
  }

  public async findWebsocket() {
    this.logger.verbose('Finding websocket');
    const data = await this.prismaRepository.websocket.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      this.logger.verbose('Websocket not found');
      throw new NotFoundException('Websocket not found');
    }

    this.logger.verbose(`Websocket events: ${data.events}`);
    return data;
  }

  public async loadRabbitmq() {
    this.logger.verbose('Loading rabbitmq');
    const data = await this.prismaRepository.rabbitmq.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localRabbitmq.enabled = data?.enabled;
    this.logger.verbose(`Rabbitmq enabled: ${this.localRabbitmq.enabled}`);

    this.localRabbitmq.events = data?.events;
    this.logger.verbose(`Rabbitmq events: ${this.localRabbitmq.events}`);

    this.logger.verbose('Rabbitmq loaded');
  }

  public async setRabbitmq(data: RabbitmqDto) {
    this.logger.verbose('Setting rabbitmq');
    await this.prismaRepository.rabbitmq.create({
      data: {
        enabled: data.enabled,
        events: data.events,
        instanceId: this.instanceId,
      },
    });

    this.logger.verbose(`Rabbitmq events: ${data.events}`);
    Object.assign(this.localRabbitmq, data);
    this.logger.verbose('Rabbitmq set');
  }

  public async findRabbitmq() {
    this.logger.verbose('Finding rabbitmq');
    const data = await this.prismaRepository.rabbitmq.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      this.logger.verbose('Rabbitmq not found');
      throw new NotFoundException('Rabbitmq not found');
    }

    this.logger.verbose(`Rabbitmq events: ${data.events}`);
    return data;
  }

  public async removeRabbitmqQueues() {
    this.logger.verbose('Removing rabbitmq');

    if (this.localRabbitmq.enabled) {
      removeQueues(this.instanceName, this.localRabbitmq.events);
    }
  }

  public async loadSqs() {
    this.logger.verbose('Loading sqs');
    const data = await this.prismaRepository.sqs.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localSqs.enabled = data?.enabled;
    this.logger.verbose(`Sqs enabled: ${this.localSqs.enabled}`);

    this.localSqs.events = data?.events;
    this.logger.verbose(`Sqs events: ${this.localSqs.events}`);

    this.logger.verbose('Sqs loaded');
  }

  public async setSqs(data: SqsDto) {
    this.logger.verbose('Setting sqs');
    await this.prismaRepository.sqs.create({
      data: {
        enabled: data.enabled,
        events: data.events,
        instanceId: this.instanceId,
      },
    });

    this.logger.verbose(`Sqs events: ${data.events}`);
    Object.assign(this.localSqs, data);
    this.logger.verbose('Sqs set');
  }

  public async findSqs() {
    this.logger.verbose('Finding sqs');
    const data = await this.prismaRepository.sqs.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      this.logger.verbose('Sqs not found');
      throw new NotFoundException('Sqs not found');
    }

    this.logger.verbose(`Sqs events: ${data.events}`);
    return data;
  }

  public async removeSqsQueues() {
    this.logger.verbose('Removing sqs');

    if (this.localSqs.enabled) {
      removeQueuesSQS(this.instanceName, this.localSqs.events);
    }
  }

  public async loadTypebot() {
    this.logger.verbose('Loading typebot');
    const data = await this.prismaRepository.typebot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
      include: {
        sessions: true,
      },
    });

    this.localTypebot.enabled = data?.enabled;
    this.logger.verbose(`Typebot enabled: ${this.localTypebot.enabled}`);

    this.localTypebot.url = data?.url;
    this.logger.verbose(`Typebot url: ${this.localTypebot.url}`);

    this.localTypebot.typebot = data?.typebot;
    this.logger.verbose(`Typebot typebot: ${this.localTypebot.typebot}`);

    this.localTypebot.expire = data?.expire;
    this.logger.verbose(`Typebot expire: ${this.localTypebot.expire}`);

    this.localTypebot.keywordFinish = data?.keywordFinish;
    this.logger.verbose(`Typebot keywordFinish: ${this.localTypebot.keywordFinish}`);

    this.localTypebot.delayMessage = data?.delayMessage;
    this.logger.verbose(`Typebot delayMessage: ${this.localTypebot.delayMessage}`);

    this.localTypebot.unknownMessage = data?.unknownMessage;
    this.logger.verbose(`Typebot unknownMessage: ${this.localTypebot.unknownMessage}`);

    this.localTypebot.listeningFromMe = data?.listeningFromMe;
    this.logger.verbose(`Typebot listeningFromMe: ${this.localTypebot.listeningFromMe}`);

    this.localTypebot.sessions = data?.sessions;

    this.logger.verbose('Typebot loaded');
  }

  public async setTypebot(data: TypebotDto) {
    this.logger.verbose('Setting typebot');

    const typebot = await this.prismaRepository.typebot.create({
      data: {
        enabled: data.enabled,
        url: data.url,
        typebot: data.typebot,
        expire: data.expire,
        keywordFinish: data.keywordFinish,
        delayMessage: data.delayMessage,
        unknownMessage: data.unknownMessage,
        listeningFromMe: data.listeningFromMe,
        instanceId: this.instanceId,
      },
    });

    await this.prismaRepository.typebotSession.deleteMany({
      where: {
        typebotId: typebot.id,
      },
    });

    this.logger.verbose(`Typebot typebot: ${data.typebot}`);
    this.logger.verbose(`Typebot expire: ${data.expire}`);
    this.logger.verbose(`Typebot keywordFinish: ${data.keywordFinish}`);
    this.logger.verbose(`Typebot delayMessage: ${data.delayMessage}`);
    this.logger.verbose(`Typebot unknownMessage: ${data.unknownMessage}`);
    this.logger.verbose(`Typebot listeningFromMe: ${data.listeningFromMe}`);
    Object.assign(this.localTypebot, data);
    this.logger.verbose('Typebot set');
  }

  public async findTypebot() {
    this.logger.verbose('Finding typebot');
    const data = await this.prismaRepository.typebot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
      include: {
        sessions: true,
      },
    });

    if (!data) {
      this.logger.verbose('Typebot not found');
      throw new NotFoundException('Typebot not found');
    }

    return {
      enabled: data.enabled,
      url: data.url,
      typebot: data.typebot,
      expire: data.expire,
      keywordFinish: data.keywordFinish,
      delayMessage: data.delayMessage,
      unknownMessage: data.unknownMessage,
      listeningFromMe: data.listeningFromMe,
      sessions: data.sessions,
    };
  }

  public async loadProxy() {
    this.logger.verbose('Loading proxy');
    const data = await this.prismaRepository.proxy.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localProxy.enabled = data?.enabled;
    this.logger.verbose(`Proxy enabled: ${this.localProxy.enabled}`);

    this.localProxy.proxy = {
      host: data?.host,
      port: `${data?.port}`,
      username: data?.username,
      password: data?.password,
    };

    this.logger.verbose(`Proxy proxy: ${this.localProxy.proxy?.host}`);

    this.logger.verbose('Proxy loaded');
  }

  public async setProxy(data: ProxyDto) {
    this.logger.verbose('Setting proxy');
    await this.prismaRepository.proxy.create({
      data: {
        enabled: data.enabled,
        host: data.host,
        port: data.port,
        username: data.username,
        password: data.password,
        instanceId: this.instanceId,
      },
    });

    this.logger.verbose(`Proxy proxy: ${data.host}`);
    Object.assign(this.localProxy, data);
    this.logger.verbose('Proxy set');
  }

  public async findProxy() {
    this.logger.verbose('Finding proxy');
    const data = await this.prismaRepository.proxy.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      this.logger.verbose('Proxy not found');
      throw new NotFoundException('Proxy not found');
    }

    return data;
  }

  public async sendDataWebhook<T = any>(event: Events, data: T, local = true) {
    const webhookGlobal = this.configService.get<Webhook>('WEBHOOK');
    const webhookLocal = this.localWebhook.events;
    const websocketLocal = this.localWebsocket.events;
    const rabbitmqLocal = this.localRabbitmq.events;
    const sqsLocal = this.localSqs.events;
    const serverUrl = this.configService.get<HttpServer>('SERVER').URL;
    const rabbitmqEnabled = this.configService.get<Rabbitmq>('RABBITMQ').ENABLED;
    const rabbitmqGlobal = this.configService.get<Rabbitmq>('RABBITMQ').GLOBAL_ENABLED;
    const rabbitmqEvents = this.configService.get<Rabbitmq>('RABBITMQ').EVENTS;
    const we = event.replace(/[.-]/gm, '_').toUpperCase();
    const transformedWe = we.replace(/_/gm, '-').toLowerCase();
    const tzoffset = new Date().getTimezoneOffset() * 60000; //offset in milliseconds
    const localISOTime = new Date(Date.now() - tzoffset).toISOString();
    const now = localISOTime;

    const expose = this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES;
    const tokenStore = await this.prismaRepository.auth.findFirst({
      where: {
        instanceId: this.instanceId,
      },
    });
    const instanceApikey = tokenStore?.apikey || 'Apikey not found';

    if (rabbitmqEnabled) {
      const amqp = getAMQP();
      if (this.localRabbitmq.enabled && amqp) {
        if (Array.isArray(rabbitmqLocal) && rabbitmqLocal.includes(we)) {
          const exchangeName = this.instanceName ?? 'evolution_exchange';

          let retry = 0;

          while (retry < 3) {
            try {
              await amqp.assertExchange(exchangeName, 'topic', {
                durable: true,
                autoDelete: false,
              });

              const queueName = `${this.instanceName}.${event}`;

              await amqp.assertQueue(queueName, {
                durable: true,
                autoDelete: false,
                arguments: {
                  'x-queue-type': 'quorum',
                },
              });

              await amqp.bindQueue(queueName, exchangeName, event);

              const message = {
                event,
                instance: this.instance.name,
                data,
                server_url: serverUrl,
                date_time: now,
                sender: this.wuid,
              };

              if (expose && instanceApikey) {
                message['apikey'] = instanceApikey;
              }

              await amqp.publish(exchangeName, event, Buffer.from(JSON.stringify(message)));

              if (this.configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS')) {
                const logData = {
                  local: ChannelStartupService.name + '.sendData-RabbitMQ',
                  event,
                  instance: this.instance.name,
                  data,
                  server_url: serverUrl,
                  apikey: (expose && instanceApikey) || null,
                  date_time: now,
                  sender: this.wuid,
                };

                if (expose && instanceApikey) {
                  logData['apikey'] = instanceApikey;
                }

                this.logger.log(logData);
              }
              break;
            } catch (error) {
              retry++;
            }
          }
        }
      }

      if (rabbitmqGlobal && rabbitmqEvents[we] && amqp) {
        const exchangeName = 'evolution_exchange';

        let retry = 0;

        while (retry < 3) {
          try {
            await amqp.assertExchange(exchangeName, 'topic', {
              durable: true,
              autoDelete: false,
            });

            const queueName = transformedWe;

            await amqp.assertQueue(queueName, {
              durable: true,
              autoDelete: false,
              arguments: {
                'x-queue-type': 'quorum',
              },
            });

            await amqp.bindQueue(queueName, exchangeName, event);

            const message = {
              event,
              instance: this.instance.name,
              data,
              server_url: serverUrl,
              date_time: now,
              sender: this.wuid,
            };

            if (expose && instanceApikey) {
              message['apikey'] = instanceApikey;
            }
            await amqp.publish(exchangeName, event, Buffer.from(JSON.stringify(message)));

            if (this.configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS')) {
              const logData = {
                local: ChannelStartupService.name + '.sendData-RabbitMQ-Global',
                event,
                instance: this.instance.name,
                data,
                server_url: serverUrl,
                apikey: (expose && instanceApikey) || null,
                date_time: now,
                sender: this.wuid,
              };

              if (expose && instanceApikey) {
                logData['apikey'] = instanceApikey;
              }

              this.logger.log(logData);
            }

            break;
          } catch (error) {
            retry++;
          }
        }
      }
    }

    if (this.localSqs.enabled) {
      const sqs = getSQS();

      if (sqs) {
        if (Array.isArray(sqsLocal) && sqsLocal.includes(we)) {
          const eventFormatted = `${event.replace('.', '_').toLowerCase()}`;

          const queueName = `${this.instanceName}_${eventFormatted}.fifo`;

          const sqsConfig = this.configService.get<Sqs>('SQS');

          const sqsUrl = `https://sqs.${sqsConfig.REGION}.amazonaws.com/${sqsConfig.ACCOUNT_ID}/${queueName}`;

          const message = {
            event,
            instance: this.instance.name,
            data,
            server_url: serverUrl,
            date_time: now,
            sender: this.wuid,
          };

          if (expose && instanceApikey) {
            message['apikey'] = instanceApikey;
          }

          const params = {
            MessageBody: JSON.stringify(message),
            MessageGroupId: 'evolution',
            MessageDeduplicationId: `${this.instanceName}_${eventFormatted}_${Date.now()}`,
            QueueUrl: sqsUrl,
          };

          sqs.sendMessage(params, (err, data) => {
            if (err) {
              this.logger.error({
                local: ChannelStartupService.name + '.sendData-SQS',
                message: err?.message,
                hostName: err?.hostname,
                code: err?.code,
                stack: err?.stack,
                name: err?.name,
                url: queueName,
                server_url: serverUrl,
              });
            } else {
              if (this.configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS')) {
                const logData = {
                  local: ChannelStartupService.name + '.sendData-SQS',
                  event,
                  instance: this.instance.name,
                  data,
                  server_url: serverUrl,
                  apikey: (expose && instanceApikey) || null,
                  date_time: now,
                  sender: this.wuid,
                };

                if (expose && instanceApikey) {
                  logData['apikey'] = instanceApikey;
                }

                this.logger.log(logData);
              }
            }
          });
        }
      }
    }

    if (this.configService.get<Websocket>('WEBSOCKET')?.ENABLED) {
      this.logger.verbose('Sending data to websocket on channel: ' + this.instance.name);
      const io = getIO();

      const message = {
        event,
        instance: this.instance.name,
        data,
        server_url: serverUrl,
        date_time: now,
        sender: this.wuid,
      };

      if (expose && instanceApikey) {
        message['apikey'] = instanceApikey;
      }

      if (this.configService.get<Websocket>('WEBSOCKET')?.GLOBAL_EVENTS) {
        io.emit(event, message);

        if (this.configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS')) {
          const logData = {
            local: ChannelStartupService.name + '.sendData-WebsocketGlobal',
            event,
            instance: this.instance.name,
            data,
            server_url: serverUrl,
            apikey: (expose && instanceApikey) || null,
            date_time: now,
            sender: this.wuid,
          };

          if (expose && instanceApikey) {
            logData['apikey'] = instanceApikey;
          }

          this.logger.log(logData);
        }
      }

      if (this.localWebsocket.enabled && Array.isArray(websocketLocal) && websocketLocal.includes(we)) {
        this.logger.verbose('Sending data to websocket on event: ' + event);

        this.logger.verbose('Sending data to socket.io in channel: ' + this.instance.name);
        io.of(`/${this.instance.name}`).emit(event, message);

        if (this.configService.get<Websocket>('WEBSOCKET')?.GLOBAL_EVENTS) {
          io.emit(event, message);
        }

        if (this.configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS')) {
          const logData = {
            local: ChannelStartupService.name + '.sendData-Websocket',
            event,
            instance: this.instance.name,
            data,
            server_url: serverUrl,
            apikey: (expose && instanceApikey) || null,
            date_time: now,
            sender: this.wuid,
          };

          if (expose && instanceApikey) {
            logData['apikey'] = instanceApikey;
          }

          this.logger.log(logData);
        }
      }
    }

    const globalApiKey = this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY;

    if (local) {
      if (Array.isArray(webhookLocal) && webhookLocal.includes(we)) {
        this.logger.verbose('Sending data to webhook local');
        let baseURL: string;

        if (this.localWebhook.webhookByEvents) {
          baseURL = `${this.localWebhook.url}/${transformedWe}`;
        } else {
          baseURL = this.localWebhook.url;
        }

        if (this.configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS')) {
          const logData = {
            local: ChannelStartupService.name + '.sendDataWebhook-local',
            url: baseURL,
            event,
            instance: this.instance.name,
            data,
            destination: this.localWebhook.url,
            date_time: now,
            sender: this.wuid,
            server_url: serverUrl,
            apikey: (expose && instanceApikey) || null,
          };

          if (expose && instanceApikey) {
            logData['apikey'] = instanceApikey;
          }

          this.logger.log(logData);
        }

        try {
          if (this.localWebhook.enabled && isURL(this.localWebhook.url, { require_tld: false })) {
            const httpService = axios.create({ baseURL });
            const postData = {
              event,
              instance: this.instance.name,
              data,
              destination: this.localWebhook.url,
              date_time: now,
              sender: this.wuid,
              server_url: serverUrl,
            };

            if (expose && instanceApikey) {
              postData['apikey'] = instanceApikey;
            }

            await httpService.post('', postData);
          }
        } catch (error) {
          this.logger.error({
            local: ChannelStartupService.name + '.sendDataWebhook-local',
            message: error?.message,
            hostName: error?.hostname,
            syscall: error?.syscall,
            code: error?.code,
            error: error?.errno,
            stack: error?.stack,
            name: error?.name,
            url: baseURL,
            server_url: serverUrl,
          });
        }
      }
    }

    if (webhookGlobal.GLOBAL?.ENABLED) {
      if (webhookGlobal.EVENTS[we]) {
        this.logger.verbose('Sending data to webhook global');
        const globalWebhook = this.configService.get<Webhook>('WEBHOOK').GLOBAL;

        let globalURL;

        if (webhookGlobal.GLOBAL.WEBHOOK_BY_EVENTS) {
          globalURL = `${globalWebhook.URL}/${transformedWe}`;
        } else {
          globalURL = globalWebhook.URL;
        }

        const localUrl = this.localWebhook.url;

        if (this.configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS')) {
          const logData = {
            local: ChannelStartupService.name + '.sendDataWebhook-global',
            url: globalURL,
            event,
            instance: this.instance.name,
            data,
            destination: localUrl,
            date_time: now,
            sender: this.wuid,
            server_url: serverUrl,
          };

          if (expose && globalApiKey) {
            logData['apikey'] = globalApiKey;
          }

          this.logger.log(logData);
        }

        try {
          if (globalWebhook && globalWebhook?.ENABLED && isURL(globalURL)) {
            const httpService = axios.create({ baseURL: globalURL });
            const postData = {
              event,
              instance: this.instance.name,
              data,
              destination: localUrl,
              date_time: now,
              sender: this.wuid,
              server_url: serverUrl,
            };

            if (expose && globalApiKey) {
              postData['apikey'] = globalApiKey;
            }

            await httpService.post('', postData);
          }
        } catch (error) {
          this.logger.error({
            local: ChannelStartupService.name + '.sendDataWebhook-global',
            message: error?.message,
            hostName: error?.hostname,
            syscall: error?.syscall,
            code: error?.code,
            error: error?.errno,
            stack: error?.stack,
            name: error?.name,
            url: globalURL,
            server_url: serverUrl,
          });
        }
      }
    }
  }

  public cleanStore() {
    this.logger.verbose('Cronjob to clean store initialized');
    const cleanStore = this.configService.get<CleanStoreConf>('CLEAN_STORE');
    const database = this.configService.get<Database>('DATABASE');
    if (cleanStore?.CLEANING_INTERVAL && !database.ENABLED) {
      this.logger.verbose('Cronjob to clean store enabled');
      setInterval(() => {
        try {
          for (const [key, value] of Object.entries(cleanStore)) {
            if (value === true) {
              execSync(
                `rm -rf ${join(this.storePath, key.toLowerCase().replace('_', '-'), this.instance.name)}/*.json`,
              );
              this.logger.verbose(
                `Cleaned ${join(this.storePath, key.toLowerCase().replace('_', '-'), this.instance.name)}/*.json`,
              );
            }
          }
        } catch (error) {
          this.logger.error(error);
        }
      }, (cleanStore?.CLEANING_INTERVAL ?? 3600) * 1000);
    }
  }

  // Check if the number is MX or AR
  public formatMXOrARNumber(jid: string): string {
    const countryCode = jid.substring(0, 2);

    if (Number(countryCode) === 52 || Number(countryCode) === 54) {
      if (jid.length === 13) {
        const number = countryCode + jid.substring(3);
        return number;
      }

      return jid;
    }
    return jid;
  }

  // Check if the number is br
  public formatBRNumber(jid: string) {
    const regexp = new RegExp(/^(\d{2})(\d{2})\d{1}(\d{8})$/);
    if (regexp.test(jid)) {
      const match = regexp.exec(jid);
      if (match && match[1] === '55') {
        const joker = Number.parseInt(match[3][0]);
        const ddd = Number.parseInt(match[2]);
        if (joker < 7 || ddd < 31) {
          return match[0];
        }
        return match[1] + match[2] + match[3];
      }
      return jid;
    } else {
      return jid;
    }
  }

  public createJid(number: string): string {
    this.logger.verbose('Creating jid with number: ' + number);

    if (number.includes('@g.us') || number.includes('@s.whatsapp.net') || number.includes('@lid')) {
      this.logger.verbose('Number already contains @g.us or @s.whatsapp.net or @lid');
      return number;
    }

    if (number.includes('@broadcast')) {
      this.logger.verbose('Number already contains @broadcast');
      return number;
    }

    number = number
      ?.replace(/\s/g, '')
      .replace(/\+/g, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .split(':')[0]
      .split('@')[0];

    if (number.includes('-') && number.length >= 24) {
      this.logger.verbose('Jid created is group: ' + `${number}@g.us`);
      number = number.replace(/[^\d-]/g, '');
      return `${number}@g.us`;
    }

    number = number.replace(/\D/g, '');

    if (number.length >= 18) {
      this.logger.verbose('Jid created is group: ' + `${number}@g.us`);
      number = number.replace(/[^\d-]/g, '');
      return `${number}@g.us`;
    }

    number = this.formatMXOrARNumber(number);

    number = this.formatBRNumber(number);

    this.logger.verbose('Jid created is whatsapp: ' + `${number}@s.whatsapp.net`);
    return `${number}@s.whatsapp.net`;
  }

  public async fetchContacts(query: any) {
    this.logger.verbose('Fetching contacts');
    if (query?.where) {
      query.where.remoteJid = this.instance.name;
      if (query.where?.remoteJid) {
        query.where.remoteJid = this.createJid(query.where.remoteJid);
      }
    } else {
      query = {
        where: {
          instanceId: this.instanceId,
        },
      };
    }
    return await this.prismaRepository.contact.findMany({
      where: query.where,
    });
  }

  public async fetchMessages(query: any) {
    this.logger.verbose('Fetching messages');
    if (query?.where) {
      if (query.where?.key?.remoteJid) {
        query.where.key.remoteJid = this.createJid(query.where.key.remoteJid);
      }
      query.where.instanceId = this.instanceId;
    } else {
      query = {
        where: {
          instanceId: this.instanceId,
        },
        limit: query?.limit,
      };
    }
    return await this.prismaRepository.message.findMany(query);
  }

  public async fetchStatusMessage(query: any) {
    this.logger.verbose('Fetching status messages');
    if (query?.where) {
      if (query.where?.remoteJid) {
        query.where.remoteJid = this.createJid(query.where.remoteJid);
      }
      query.where.instanceId = this.instanceId;
    } else {
      query = {
        where: {
          instanceId: this.instanceId,
        },
        limit: query?.limit,
      };
    }
    return await this.prismaRepository.messageUpdate.findMany(query);
  }

  public async fetchChats() {
    this.logger.verbose('Fetching chats');
    return await this.prismaRepository.chat.findMany({ where: { instanceId: this.instanceId } });
  }
}
