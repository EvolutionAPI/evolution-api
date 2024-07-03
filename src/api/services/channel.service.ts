import axios from 'axios';
import { WASocket } from 'baileys';
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
import { ChamaaiService } from '../integrations/chamaai/services/chamaai.service';
import { ChatwootRaw } from '../integrations/chatwoot/models/chatwoot.model';
import { ChatwootService } from '../integrations/chatwoot/services/chatwoot.service';
import { getAMQP, removeQueues } from '../integrations/rabbitmq/libs/amqp.server';
import { getSQS, removeQueues as removeQueuesSQS } from '../integrations/sqs/libs/sqs.server';
import { TypebotService } from '../integrations/typebot/services/typebot.service';
import { getIO } from '../integrations/websocket/libs/socket.server';
import { WebsocketRaw } from '../integrations/websocket/models/websocket.model';
import { ChamaaiRaw, IntegrationRaw, ProxyRaw, RabbitmqRaw, SettingsRaw, SqsRaw, TypebotRaw } from '../models';
import { WebhookRaw } from '../models/webhook.model';
import { ContactQuery } from '../repository/contact.repository';
import { MessageQuery } from '../repository/message.repository';
import { MessageUpQuery } from '../repository/messageUp.repository';
import { RepositoryBroker } from '../repository/repository.manager';
import { waMonitor } from '../server.module';
import { Events, wa } from '../types/wa.types';
import { CacheService } from './cache.service';

export class ChannelStartupService {
  constructor(
    public readonly configService: ConfigService,
    public readonly eventEmitter: EventEmitter2,
    public readonly repository: RepositoryBroker,
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
  public readonly localChamaai: wa.LocalChamaai = {};
  public readonly localIntegration: wa.LocalIntegration = {};
  public readonly localSettings: wa.LocalSettings = {};
  public readonly storePath = join(ROOT_DIR, 'store');

  public chatwootService = new ChatwootService(waMonitor, this.configService, this.repository, this.chatwootCache);

  public typebotService = new TypebotService(waMonitor, this.configService, this.eventEmitter);

  public chamaaiService = new ChamaaiService(waMonitor, this.configService);

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

  public get wuid() {
    this.logger.verbose('Getting remoteJid of instance');
    return this.instance.wuid;
  }

  public async loadIntegration() {
    this.logger.verbose('Loading webhook');
    const data = await this.repository.integration.find(this.instanceName);
    this.localIntegration.integration = data?.integration;
    this.logger.verbose(`Integration: ${this.localIntegration.integration}`);

    this.localIntegration.number = data?.number;
    this.logger.verbose(`Integration number: ${this.localIntegration.number}`);

    this.localIntegration.token = data?.token;
    this.logger.verbose(`Integration token: ${this.localIntegration.token}`);

    this.logger.verbose('Integration loaded');
  }

  public async setIntegration(data: IntegrationRaw) {
    this.logger.verbose('Setting integration');
    await this.repository.integration.create(data, this.instanceName);
    this.logger.verbose(`Integration: ${data.integration}`);
    this.logger.verbose(`Integration number: ${data.number}`);
    this.logger.verbose(`Integration token: ${data.token}`);
    Object.assign(this.localIntegration, data);
    this.logger.verbose('Integration set');
  }

  public async findIntegration() {
    this.logger.verbose('Finding integration');
    let data: any;

    data = await this.repository.integration.find(this.instanceName);

    if (!data) {
      this.repository.integration.create({ integration: 'WHATSAPP-BAILEYS', number: '', token: '' }, this.instanceName);
      data = { integration: 'WHATSAPP-BAILEYS', number: '', token: '' };
    }

    this.logger.verbose(`Integration: ${data.integration}`);
    this.logger.verbose(`Integration number: ${data.number}`);
    this.logger.verbose(`Integration token: ${data.token}`);

    return {
      integration: data.integration,
      number: data.number,
      token: data.token,
    };
  }

  public async loadSettings() {
    this.logger.verbose('Loading settings');
    const data = await this.repository.settings.find(this.instanceName);
    this.localSettings.reject_call = data?.reject_call;
    this.logger.verbose(`Settings reject_call: ${this.localSettings.reject_call}`);

    this.localSettings.msg_call = data?.msg_call;
    this.logger.verbose(`Settings msg_call: ${this.localSettings.msg_call}`);

    this.localSettings.groups_ignore = data?.groups_ignore;
    this.logger.verbose(`Settings groups_ignore: ${this.localSettings.groups_ignore}`);

    this.localSettings.always_online = data?.always_online;
    this.logger.verbose(`Settings always_online: ${this.localSettings.always_online}`);

    this.localSettings.read_messages = data?.read_messages;
    this.logger.verbose(`Settings read_messages: ${this.localSettings.read_messages}`);

    this.localSettings.read_status = data?.read_status;
    this.logger.verbose(`Settings read_status: ${this.localSettings.read_status}`);

    this.localSettings.sync_full_history = data?.sync_full_history;
    this.logger.verbose(`Settings sync_full_history: ${this.localSettings.sync_full_history}`);

    this.logger.verbose('Settings loaded');
  }

  public async setSettings(data: SettingsRaw) {
    this.logger.verbose('Setting settings');
    await this.repository.settings.create(data, this.instanceName);
    this.logger.verbose(`Settings reject_call: ${data.reject_call}`);
    this.logger.verbose(`Settings msg_call: ${data.msg_call}`);
    this.logger.verbose(`Settings groups_ignore: ${data.groups_ignore}`);
    this.logger.verbose(`Settings always_online: ${data.always_online}`);
    this.logger.verbose(`Settings read_messages: ${data.read_messages}`);
    this.logger.verbose(`Settings read_status: ${data.read_status}`);
    this.logger.verbose(`Settings sync_full_history: ${data.sync_full_history}`);
    Object.assign(this.localSettings, data);
    this.logger.verbose('Settings set');
  }

  public async findSettings() {
    this.logger.verbose('Finding settings');
    const data = await this.repository.settings.find(this.instanceName);

    if (!data) {
      this.logger.verbose('Settings not found');
      return null;
    }

    this.logger.verbose(`Settings url: ${data.reject_call}`);
    this.logger.verbose(`Settings msg_call: ${data.msg_call}`);
    this.logger.verbose(`Settings groups_ignore: ${data.groups_ignore}`);
    this.logger.verbose(`Settings always_online: ${data.always_online}`);
    this.logger.verbose(`Settings read_messages: ${data.read_messages}`);
    this.logger.verbose(`Settings read_status: ${data.read_status}`);
    this.logger.verbose(`Settings sync_full_history: ${data.sync_full_history}`);
    return {
      reject_call: data.reject_call,
      msg_call: data.msg_call,
      groups_ignore: data.groups_ignore,
      always_online: data.always_online,
      read_messages: data.read_messages,
      read_status: data.read_status,
      sync_full_history: data.sync_full_history,
    };
  }

  public async loadWebhook() {
    this.logger.verbose('Loading webhook');
    const data = await this.repository.webhook.find(this.instanceName);
    this.localWebhook.url = data?.url;
    this.logger.verbose(`Webhook url: ${this.localWebhook.url}`);

    this.localWebhook.enabled = data?.enabled;
    this.logger.verbose(`Webhook enabled: ${this.localWebhook.enabled}`);

    this.localWebhook.events = data?.events;
    this.logger.verbose(`Webhook events: ${this.localWebhook.events}`);

    this.localWebhook.webhook_by_events = data?.webhook_by_events;
    this.logger.verbose(`Webhook by events: ${this.localWebhook.webhook_by_events}`);

    this.localWebhook.webhook_base64 = data?.webhook_base64;
    this.logger.verbose(`Webhook by webhook_base64: ${this.localWebhook.webhook_base64}`);

    this.logger.verbose('Webhook loaded');
  }

  public async setWebhook(data: WebhookRaw) {
    this.logger.verbose('Setting webhook');
    await this.repository.webhook.create(data, this.instanceName);
    this.logger.verbose(`Webhook url: ${data.url}`);
    this.logger.verbose(`Webhook events: ${data.events}`);
    Object.assign(this.localWebhook, data);
    this.logger.verbose('Webhook set');
  }

  public async findWebhook() {
    this.logger.verbose('Finding webhook');
    const data = await this.repository.webhook.find(this.instanceName);

    if (!data) {
      this.logger.verbose('Webhook not found');
      throw new NotFoundException('Webhook not found');
    }

    this.logger.verbose(`Webhook url: ${data.url}`);
    this.logger.verbose(`Webhook events: ${data.events}`);

    return {
      enabled: data.enabled,
      url: data.url,
      events: data.events,
      webhook_by_events: data.webhook_by_events,
      webhook_base64: data.webhook_base64,
    };
  }

  public async loadChatwoot() {
    this.logger.verbose('Loading chatwoot');
    const data = await this.repository.chatwoot.find(this.instanceName);
    this.localChatwoot.enabled = data?.enabled;
    this.logger.verbose(`Chatwoot enabled: ${this.localChatwoot.enabled}`);

    this.localChatwoot.account_id = data?.account_id;
    this.logger.verbose(`Chatwoot account id: ${this.localChatwoot.account_id}`);

    this.localChatwoot.token = data?.token;
    this.logger.verbose(`Chatwoot token: ${this.localChatwoot.token}`);

    this.localChatwoot.url = data?.url;
    this.logger.verbose(`Chatwoot url: ${this.localChatwoot.url}`);

    this.localChatwoot.name_inbox = data?.name_inbox;
    this.logger.verbose(`Chatwoot inbox name: ${this.localChatwoot.name_inbox}`);

    this.localChatwoot.sign_msg = data?.sign_msg;
    this.logger.verbose(`Chatwoot sign msg: ${this.localChatwoot.sign_msg}`);

    this.localChatwoot.number = data?.number;
    this.logger.verbose(`Chatwoot number: ${this.localChatwoot.number}`);

    this.localChatwoot.reopen_conversation = data?.reopen_conversation;
    this.logger.verbose(`Chatwoot reopen conversation: ${this.localChatwoot.reopen_conversation}`);

    this.localChatwoot.conversation_pending = data?.conversation_pending;
    this.logger.verbose(`Chatwoot conversation pending: ${this.localChatwoot.conversation_pending}`);

    this.localChatwoot.merge_brazil_contacts = data?.merge_brazil_contacts;
    this.logger.verbose(`Chatwoot merge brazil contacts: ${this.localChatwoot.merge_brazil_contacts}`);

    this.localChatwoot.import_contacts = data?.import_contacts;
    this.logger.verbose(`Chatwoot import contacts: ${this.localChatwoot.import_contacts}`);

    this.localChatwoot.import_messages = data?.import_messages;
    this.logger.verbose(`Chatwoot import messages: ${this.localChatwoot.import_messages}`);

    this.localChatwoot.days_limit_import_messages = data?.days_limit_import_messages;
    this.logger.verbose(`Chatwoot days limit import messages: ${this.localChatwoot.days_limit_import_messages}`);

    this.logger.verbose('Chatwoot loaded');
  }

  public async setChatwoot(data: ChatwootRaw) {
    this.logger.verbose('Setting chatwoot');
    await this.repository.chatwoot.create(data, this.instanceName);
    this.logger.verbose(`Chatwoot account id: ${data.account_id}`);
    this.logger.verbose(`Chatwoot token: ${data.token}`);
    this.logger.verbose(`Chatwoot url: ${data.url}`);
    this.logger.verbose(`Chatwoot inbox name: ${data.name_inbox}`);
    this.logger.verbose(`Chatwoot sign msg: ${data.sign_msg}`);
    this.logger.verbose(`Chatwoot sign delimiter: ${data.sign_delimiter}`);
    this.logger.verbose(`Chatwoot reopen conversation: ${data.reopen_conversation}`);
    this.logger.verbose(`Chatwoot conversation pending: ${data.conversation_pending}`);
    this.logger.verbose(`Chatwoot merge brazil contacts: ${data.merge_brazil_contacts}`);
    this.logger.verbose(`Chatwoot import contacts: ${data.import_contacts}`);
    this.logger.verbose(`Chatwoot import messages: ${data.import_messages}`);
    this.logger.verbose(`Chatwoot days limit import messages: ${data.days_limit_import_messages}`);

    Object.assign(this.localChatwoot, { ...data, sign_delimiter: data.sign_msg ? data.sign_delimiter : null });

    this.clearCacheChatwoot();

    this.logger.verbose('Chatwoot set');
  }

  public async findChatwoot() {
    this.logger.verbose('Finding chatwoot');
    const data = await this.repository.chatwoot.find(this.instanceName);

    if (!data) {
      this.logger.verbose('Chatwoot not found');
      return null;
    }

    this.logger.verbose(`Chatwoot account id: ${data.account_id}`);
    this.logger.verbose(`Chatwoot token: ${data.token}`);
    this.logger.verbose(`Chatwoot url: ${data.url}`);
    this.logger.verbose(`Chatwoot inbox name: ${data.name_inbox}`);
    this.logger.verbose(`Chatwoot sign msg: ${data.sign_msg}`);
    this.logger.verbose(`Chatwoot sign delimiter: ${data.sign_delimiter}`);
    this.logger.verbose(`Chatwoot reopen conversation: ${data.reopen_conversation}`);
    this.logger.verbose(`Chatwoot conversation pending: ${data.conversation_pending}`);
    this.logger.verbose(`Chatwoot merge brazilian contacts: ${data.merge_brazil_contacts}`);
    this.logger.verbose(`Chatwoot import contacts: ${data.import_contacts}`);
    this.logger.verbose(`Chatwoot import messages: ${data.import_messages}`);
    this.logger.verbose(`Chatwoot days limit import messages: ${data.days_limit_import_messages}`);

    return {
      enabled: data.enabled,
      account_id: data.account_id,
      token: data.token,
      url: data.url,
      name_inbox: data.name_inbox,
      sign_msg: data.sign_msg,
      sign_delimiter: data.sign_delimiter || null,
      reopen_conversation: data.reopen_conversation,
      conversation_pending: data.conversation_pending,
      merge_brazil_contacts: data.merge_brazil_contacts,
      import_contacts: data.import_contacts,
      import_messages: data.import_messages,
      days_limit_import_messages: data.days_limit_import_messages,
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
    const data = await this.repository.websocket.find(this.instanceName);

    this.localWebsocket.enabled = data?.enabled;
    this.logger.verbose(`Websocket enabled: ${this.localWebsocket.enabled}`);

    this.localWebsocket.events = data?.events;
    this.logger.verbose(`Websocket events: ${this.localWebsocket.events}`);

    this.logger.verbose('Websocket loaded');
  }

  public async setWebsocket(data: WebsocketRaw) {
    this.logger.verbose('Setting websocket');
    await this.repository.websocket.create(data, this.instanceName);
    this.logger.verbose(`Websocket events: ${data.events}`);
    Object.assign(this.localWebsocket, data);
    this.logger.verbose('Websocket set');
  }

  public async findWebsocket() {
    this.logger.verbose('Finding websocket');
    const data = await this.repository.websocket.find(this.instanceName);

    if (!data) {
      this.logger.verbose('Websocket not found');
      throw new NotFoundException('Websocket not found');
    }

    this.logger.verbose(`Websocket events: ${data.events}`);
    return {
      enabled: data.enabled,
      events: data.events,
    };
  }

  public async loadRabbitmq() {
    this.logger.verbose('Loading rabbitmq');
    const data = await this.repository.rabbitmq.find(this.instanceName);

    this.localRabbitmq.enabled = data?.enabled;
    this.logger.verbose(`Rabbitmq enabled: ${this.localRabbitmq.enabled}`);

    this.localRabbitmq.events = data?.events;
    this.logger.verbose(`Rabbitmq events: ${this.localRabbitmq.events}`);

    this.logger.verbose('Rabbitmq loaded');
  }

  public async setRabbitmq(data: RabbitmqRaw) {
    this.logger.verbose('Setting rabbitmq');
    await this.repository.rabbitmq.create(data, this.instanceName);
    this.logger.verbose(`Rabbitmq events: ${data.events}`);
    Object.assign(this.localRabbitmq, data);
    this.logger.verbose('Rabbitmq set');
  }

  public async findRabbitmq() {
    this.logger.verbose('Finding rabbitmq');
    const data = await this.repository.rabbitmq.find(this.instanceName);

    if (!data) {
      this.logger.verbose('Rabbitmq not found');
      throw new NotFoundException('Rabbitmq not found');
    }

    this.logger.verbose(`Rabbitmq events: ${data.events}`);
    return {
      enabled: data.enabled,
      events: data.events,
    };
  }

  public async removeRabbitmqQueues() {
    this.logger.verbose('Removing rabbitmq');

    if (this.localRabbitmq.enabled) {
      removeQueues(this.instanceName, this.localRabbitmq.events);
    }
  }

  public async loadSqs() {
    this.logger.verbose('Loading sqs');
    const data = await this.repository.sqs.find(this.instanceName);

    this.localSqs.enabled = data?.enabled;
    this.logger.verbose(`Sqs enabled: ${this.localSqs.enabled}`);

    this.localSqs.events = data?.events;
    this.logger.verbose(`Sqs events: ${this.localSqs.events}`);

    this.logger.verbose('Sqs loaded');
  }

  public async setSqs(data: SqsRaw) {
    this.logger.verbose('Setting sqs');
    await this.repository.sqs.create(data, this.instanceName);
    this.logger.verbose(`Sqs events: ${data.events}`);
    Object.assign(this.localSqs, data);
    this.logger.verbose('Sqs set');
  }

  public async findSqs() {
    this.logger.verbose('Finding sqs');
    const data = await this.repository.sqs.find(this.instanceName);

    if (!data) {
      this.logger.verbose('Sqs not found');
      throw new NotFoundException('Sqs not found');
    }

    this.logger.verbose(`Sqs events: ${data.events}`);
    return {
      enabled: data.enabled,
      events: data.events,
    };
  }

  public async removeSqsQueues() {
    this.logger.verbose('Removing sqs');

    if (this.localSqs.enabled) {
      removeQueuesSQS(this.instanceName, this.localSqs.events);
    }
  }

  public async loadTypebot() {
    this.logger.verbose('Loading typebot');
    const data = await this.repository.typebot.find(this.instanceName);

    this.localTypebot.enabled = data?.enabled;
    this.logger.verbose(`Typebot enabled: ${this.localTypebot.enabled}`);

    this.localTypebot.url = data?.url;
    this.logger.verbose(`Typebot url: ${this.localTypebot.url}`);

    this.localTypebot.typebot = data?.typebot;
    this.logger.verbose(`Typebot typebot: ${this.localTypebot.typebot}`);

    this.localTypebot.expire = data?.expire;
    this.logger.verbose(`Typebot expire: ${this.localTypebot.expire}`);

    this.localTypebot.keyword_finish = data?.keyword_finish;
    this.logger.verbose(`Typebot keyword_finish: ${this.localTypebot.keyword_finish}`);

    this.localTypebot.delay_message = data?.delay_message;
    this.logger.verbose(`Typebot delay_message: ${this.localTypebot.delay_message}`);

    this.localTypebot.unknown_message = data?.unknown_message;
    this.logger.verbose(`Typebot unknown_message: ${this.localTypebot.unknown_message}`);

    this.localTypebot.listening_from_me = data?.listening_from_me;
    this.logger.verbose(`Typebot listening_from_me: ${this.localTypebot.listening_from_me}`);

    this.localTypebot.sessions = data?.sessions;

    this.logger.verbose('Typebot loaded');
  }

  public async setTypebot(data: TypebotRaw) {
    this.logger.verbose('Setting typebot');
    await this.repository.typebot.create(data, this.instanceName);
    this.logger.verbose(`Typebot typebot: ${data.typebot}`);
    this.logger.verbose(`Typebot expire: ${data.expire}`);
    this.logger.verbose(`Typebot keyword_finish: ${data.keyword_finish}`);
    this.logger.verbose(`Typebot delay_message: ${data.delay_message}`);
    this.logger.verbose(`Typebot unknown_message: ${data.unknown_message}`);
    this.logger.verbose(`Typebot listening_from_me: ${data.listening_from_me}`);
    Object.assign(this.localTypebot, data);
    this.logger.verbose('Typebot set');
  }

  public async findTypebot() {
    this.logger.verbose('Finding typebot');
    const data = await this.repository.typebot.find(this.instanceName);

    if (!data) {
      this.logger.verbose('Typebot not found');
      throw new NotFoundException('Typebot not found');
    }

    return {
      enabled: data.enabled,
      url: data.url,
      typebot: data.typebot,
      expire: data.expire,
      keyword_finish: data.keyword_finish,
      delay_message: data.delay_message,
      unknown_message: data.unknown_message,
      listening_from_me: data.listening_from_me,
      sessions: data.sessions,
    };
  }

  public async loadProxy() {
    this.logger.verbose('Loading proxy');
    const data = await this.repository.proxy.find(this.instanceName);

    this.localProxy.enabled = data?.enabled;
    this.logger.verbose(`Proxy enabled: ${this.localProxy.enabled}`);

    this.localProxy.proxy = data?.proxy;
    this.logger.verbose(`Proxy proxy: ${this.localProxy.proxy?.host}`);

    this.logger.verbose('Proxy loaded');
  }

  public async setProxy(data: ProxyRaw) {
    this.logger.verbose('Setting proxy');
    await this.repository.proxy.create(data, this.instanceName);
    this.logger.verbose(`Proxy proxy: ${data.proxy}`);
    Object.assign(this.localProxy, data);
    this.logger.verbose('Proxy set');
  }

  public async findProxy() {
    this.logger.verbose('Finding proxy');
    const data = await this.repository.proxy.find(this.instanceName);

    if (!data) {
      this.logger.verbose('Proxy not found');
      throw new NotFoundException('Proxy not found');
    }

    return {
      enabled: data.enabled,
      proxy: data.proxy,
    };
  }

  public async loadChamaai() {
    this.logger.verbose('Loading chamaai');
    const data = await this.repository.chamaai.find(this.instanceName);

    this.localChamaai.enabled = data?.enabled;
    this.logger.verbose(`Chamaai enabled: ${this.localChamaai.enabled}`);

    this.localChamaai.url = data?.url;
    this.logger.verbose(`Chamaai url: ${this.localChamaai.url}`);

    this.localChamaai.token = data?.token;
    this.logger.verbose(`Chamaai token: ${this.localChamaai.token}`);

    this.localChamaai.waNumber = data?.waNumber;
    this.logger.verbose(`Chamaai waNumber: ${this.localChamaai.waNumber}`);

    this.localChamaai.answerByAudio = data?.answerByAudio;
    this.logger.verbose(`Chamaai answerByAudio: ${this.localChamaai.answerByAudio}`);

    this.logger.verbose('Chamaai loaded');
  }

  public async setChamaai(data: ChamaaiRaw) {
    this.logger.verbose('Setting chamaai');
    await this.repository.chamaai.create(data, this.instanceName);
    this.logger.verbose(`Chamaai url: ${data.url}`);
    this.logger.verbose(`Chamaai token: ${data.token}`);
    this.logger.verbose(`Chamaai waNumber: ${data.waNumber}`);
    this.logger.verbose(`Chamaai answerByAudio: ${data.answerByAudio}`);

    Object.assign(this.localChamaai, data);
    this.logger.verbose('Chamaai set');
  }

  public async findChamaai() {
    this.logger.verbose('Finding chamaai');
    const data = await this.repository.chamaai.find(this.instanceName);

    if (!data) {
      this.logger.verbose('Chamaai not found');
      throw new NotFoundException('Chamaai not found');
    }

    return {
      enabled: data.enabled,
      url: data.url,
      token: data.token,
      waNumber: data.waNumber,
      answerByAudio: data.answerByAudio,
    };
  }

  private assertExchangeAsync = (channel, exchangeName, exchangeType, options) => {
    return new Promise((resolve, reject) => {
      channel.assertExchange(exchangeName, exchangeType, options, (error, ok) => {
        if (error) {
          reject(error);
        } else {
          resolve(ok);
        }
      });
    });
  };

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
    const tokenStore = await this.repository.auth.find(this.instanceName);
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

              const eventName = event.replace(/_/g, '.').toLowerCase();

              const queueName = `${this.instanceName}.${eventName}`;

              await amqp.assertQueue(queueName, {
                durable: true,
                autoDelete: false,
                arguments: {
                  'x-queue-type': 'quorum',
                },
              });

              await amqp.bindQueue(queueName, exchangeName, eventName);

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

            const queueName = event;

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

        if (this.localWebhook.webhook_by_events) {
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

  public async fetchContacts(query: ContactQuery) {
    this.logger.verbose('Fetching contacts');
    if (query?.where) {
      query.where.owner = this.instance.name;
      if (query.where?.id) {
        query.where.id = this.createJid(query.where.id);
      }
    } else {
      query = {
        where: {
          owner: this.instance.name,
        },
      };
    }
    return await this.repository.contact.find(query);
  }

  public async fetchMessages(query: MessageQuery) {
    this.logger.verbose('Fetching messages');
    if (query?.where) {
      if (query.where?.key?.remoteJid) {
        query.where.key.remoteJid = this.createJid(query.where.key.remoteJid);
      }
      query.where.owner = this.instance.name;
    } else {
      query = {
        where: {
          owner: this.instance.name,
        },
        limit: query?.limit,
      };
    }
    return await this.repository.message.find(query);
  }

  public async fetchStatusMessage(query: MessageUpQuery) {
    this.logger.verbose('Fetching status messages');
    if (query?.where) {
      if (query.where?.remoteJid) {
        query.where.remoteJid = this.createJid(query.where.remoteJid);
      }
      query.where.owner = this.instance.name;
    } else {
      query = {
        where: {
          owner: this.instance.name,
        },
        limit: query?.limit,
      };
    }
    return await this.repository.messageUpdate.find(query);
  }

  public async fetchChats() {
    this.logger.verbose('Fetching chats');
    return await this.repository.chat.find({ where: { owner: this.instance.name } });
  }
}
