import axios from 'axios';
import { execSync } from 'child_process';
import { isURL } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import Long from 'long';
import { join } from 'path';
import { v4 } from 'uuid';

import {
  Auth,
  CleanStoreConf,
  ConfigService,
  Database,
  HttpServer,
  Log,
  Sqs,
  Webhook,
  Websocket,
  Redis,
} from '../../config/env.config';
import {
  ContactMessage,
  MediaMessage,
  Options,
  SendAudioDto,
  SendButtonDto,
  SendContactDto,
  SendListDto,
  SendLocationDto,
  SendMediaDto,
  SendPollDto,
  SendReactionDto,
  SendStatusDto,
  SendStickerDto,
  SendTextDto,
  SendTemplateDto,
  StatusMessage,
} from '../dto/sendMessage.dto';
import {
  CreateGroupDto,
  GetParticipant,
  GroupDescriptionDto,
  GroupInvite,
  GroupJid,
  GroupPictureDto,
  GroupSendInvite,
  GroupSubjectDto,
  GroupToggleEphemeralDto,
  GroupUpdateParticipantDto,
  GroupUpdateSettingDto,
} from '../dto/group.dto';
import {getBase64FromMediaMessageDto} from '../dto/chat.dto';
import { Logger } from '../../config/logger.config';
import { INSTANCE_DIR, ROOT_DIR } from '../../config/path.config';
import { InternalServerErrorException, NotFoundException } from '../../exceptions';
import { getAMQP, removeQueues } from '../../libs/amqp.server';
import { RedisCache } from '../../libs/redis.client';
import { useMultiFileAuthStateRedisDb } from '../../utils/use-multi-file-auth-state-redis-db';
import { getIO } from '../../libs/socket.server';
import { getSQS, removeQueues as removeQueuesSQS } from '../../libs/sqs.server';
import { ChamaaiRaw, ProxyRaw, RabbitmqRaw, SettingsRaw, SqsRaw, TypebotRaw } from '../models';
import { ChatwootRaw } from '../models/chatwoot.model';
import { WebhookRaw } from '../models/webhook.model';
import { WebsocketRaw } from '../models/websocket.model';
import { RepositoryBroker } from '../repository/repository.manager';
import { Events, wa } from '../types/wa.types';
import { waMonitor } from '../whatsapp.module';
import { ChamaaiService } from './chamaai.service';
import { ChatwootService } from './chatwoot.service';
import { TypebotService } from './typebot.service';
import { ContactQuery } from '../repository/contact.repository';
import { MessageQuery } from '../repository/message.repository';
import { MessageUpQuery } from '../repository/messageUp.repository';


export class WAStartupService {
  constructor(
    protected readonly configService: ConfigService,
    protected readonly eventEmitter: EventEmitter2,
    protected readonly repository: RepositoryBroker,
    protected readonly cache: RedisCache,
  ) {
    this.logger.verbose('WAStartupService initialized');
    this.cleanStore();
    this.cleanDB();
  }

  public client: any;
  protected readonly logger = new Logger(WAStartupService.name);
  public readonly instance: wa.Instance = {};
  public readonly storePath = join(ROOT_DIR, 'store');
  protected endSession = false;
  protected phoneNumber: string;
  protected readonly localWebhook: wa.LocalWebHook = {};
  protected readonly localChatwoot: wa.LocalChatwoot = {};
  protected readonly localSettings: wa.LocalSettings = {};
  protected readonly localWebsocket: wa.LocalWebsocket = {};
  protected readonly localRabbitmq: wa.LocalRabbitmq = {};
  protected readonly localSqs: wa.LocalSqs = {};
  public readonly localTypebot: wa.LocalTypebot = {};
  protected readonly localProxy: wa.LocalProxy = {};
  protected readonly localChamaai: wa.LocalChamaai = {};
  public stateConnection: any = { state: 'close' };

  protected chatwootService = new ChatwootService(waMonitor, this.configService, this.repository);

  protected typebotService = new TypebotService(waMonitor, this.configService, this.eventEmitter);

  protected chamaaiService = new ChamaaiService(waMonitor, this.configService);

  public async getProfileName(): Promise<any>{}
  public async getProfileStatus(): Promise<any>{}
  public async reloadConnection(): Promise<any> {}
  public async textMessage(data: SendTextDto, isChatwoot = false): Promise<any> {}
  public async mediaMessage(data: SendMediaDto, isChatwoot = false): Promise<any> {}
  public async mediaSticker(data: SendStickerDto): Promise<any> {}
  public async audioWhatsapp(data: SendAudioDto, isChatwoot = false): Promise<any> {}
  public async buttonMessage(data: SendButtonDto): Promise<any> {}
  public async locationMessage(data: SendLocationDto): Promise<any> {}
  public async listMessage(data: SendListDto): Promise<any> {}
  public async templateMessage(data: SendTemplateDto, isChatwoot = false): Promise<any> {}
  public async contactMessage(data: SendContactDto): Promise<any> {}
  public async reactionMessage(data: SendReactionDto): Promise<any> {}
  public async pollMessage(data: SendPollDto): Promise<any> {}
  public async statusMessage(data: SendStatusDto): Promise<any> {}
  public async getBase64FromMediaMessage(data: getBase64FromMediaMessageDto): Promise<any> {}
  public async profilePicture(number: string): Promise<any> {}
  public async whatsappNumber(data: any): Promise<any> {}
  public async markMessageAsRead(data: any): Promise<any> {}
  public async archiveChat(data: any): Promise<any> {}
  public async deleteMessage(data: any): Promise<any> {}
  public async fetchProfile(instanceName: string, number?: string): Promise<any> {}
  public async fetchChats(): Promise<any> {}
  public async fetchContacts(query: ContactQuery): Promise<any> {}
  public async sendPresence(data: any): Promise<any> {}
  public async   fetchStatusMessage(query: MessageUpQuery): Promise<any> {}
  public async fetchPrivacySettings(): Promise<any> {}
  public async updatePrivacySettings(data: any): Promise<any> {}
  public async   fetchMessages(query: MessageQuery): Promise<any> {}
  public async fetchBusinessProfile(number: string): Promise<any> {}
  public async updateProfileName(name: string): Promise<any> {}
  public async updateProfileStatus(status: string): Promise<any> {}
  public async updateProfilePicture(picture: string): Promise<any> {}
  public async removeProfilePicture(): Promise<any> {}
  public async setWhatsappBusinessProfile(data: any): Promise<any> {}
  public async createGroup(create: CreateGroupDto): Promise<any> {}
  public async updateGroupPicture(picture: GroupPictureDto): Promise<any> {}
  public async updateGroupSubject(data: GroupSubjectDto): Promise<any> {}
  public async updateGroupDescription(data: GroupDescriptionDto): Promise<any> {}
  public async findGroup(id: GroupJid, reply: 'inner' | 'out' = 'out'): Promise<any> {}
  public async fetchAllGroups(getParticipants: GetParticipant): Promise<any> {}
  public async inviteCode(id: GroupJid): Promise<any> {}
  public async inviteInfo(id: GroupInvite): Promise<any> {}
  public async revokeInviteCode(id: GroupJid): Promise<any> {}
  public async findParticipants(id: GroupJid): Promise<any> {}
  public async updateGParticipant(update: GroupUpdateParticipantDto): Promise<any> {}
  public async updateGSetting(update: GroupUpdateSettingDto): Promise<any> {}
  public async toggleEphemeral(update: GroupToggleEphemeralDto): Promise<any> {}
  public async leaveGroup(id: GroupJid): Promise<any> {}
  public async sendInvite(id: GroupSendInvite): Promise<any> {}
  public async closeClient(): Promise<any> {}



  public set instanceName(name: string) {

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

  public set instanceNumber(number: string) {
    this.instance.number = number;
  }

  public set instanceToken(token: string) {
    this.instance.token = token;
  }

  public get instanceName() {
    this.logger.verbose('Getting instance name');
    return this.instance.name;
  }
  public get wuid() {
    this.logger.verbose('Getting remoteJid of instance');
    return this.instance.wuid;
  }

  public get profilePictureUrl() {
    this.logger.verbose('Getting profile picture url');
    return this.instance.profilePictureUrl;
  }

  public get qrCode(): wa.QrCode {
    this.logger.verbose('Getting qrcode');

    return {
      pairingCode: this.instance.qrcode?.pairingCode,
      code: this.instance.qrcode?.code,
      base64: this.instance.qrcode?.base64,
      count: this.instance.qrcode?.count,
    };
  }

  protected async loadWebhook() {
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

  protected async loadChatwoot() {
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

    Object.assign(this.localChatwoot, { ...data, sign_delimiter: data.sign_msg ? data.sign_delimiter : null });

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
    };
  }

  protected async loadSettings() {
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
    return {
      reject_call: data.reject_call,
      msg_call: data.msg_call,
      groups_ignore: data.groups_ignore,
      always_online: data.always_online,
      read_messages: data.read_messages,
      read_status: data.read_status,
    };
  }

  protected async loadWebsocket() {
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

  protected async loadRabbitmq() {
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

  protected async loadSqs() {
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

  protected async loadTypebot() {
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

  private async loadProxy() {
    this.logger.verbose('Loading proxy');
    const data = await this.repository.proxy.find(this.instanceName);

    this.localProxy.enabled = data?.enabled;
    this.logger.verbose(`Proxy enabled: ${this.localProxy.enabled}`);

    this.localProxy.proxy = data?.proxy;
    this.logger.verbose(`Proxy proxy: ${this.localProxy.proxy}`);

    this.logger.verbose('Proxy loaded');
  }

  public async setProxy(data: ProxyRaw, reload = true) {
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

  private async loadChamaai() {
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

  public async sendDataWebhook<T = any>(event: Events, data: T, local = true) {
    const webhookGlobal = this.configService.get<Webhook>('WEBHOOK');
    const webhookLocal = this.localWebhook.events;
    const websocketLocal = this.localWebsocket.events;
    const rabbitmqLocal = this.localRabbitmq.events;
    const sqsLocal = this.localSqs.events;
    const serverUrl = this.configService.get<HttpServer>('SERVER').URL;
    const we = event.replace(/[.-]/gm, '_').toUpperCase();
    const transformedWe = we.replace(/_/gm, '-').toLowerCase();
    const tzoffset = new Date().getTimezoneOffset() * 60000; //offset in milliseconds
    const localISOTime = new Date(Date.now() - tzoffset).toISOString();
    const now = localISOTime;

    const expose = this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES;
    const tokenStore = await this.repository.auth.find(this.instanceName);
    const instanceApikey = tokenStore?.apikey || 'Apikey not found';

    if (this.localRabbitmq.enabled) {
      const amqp = getAMQP();

      if (amqp) {
        if (Array.isArray(rabbitmqLocal) && rabbitmqLocal.includes(we)) {
          const exchangeName = this.instanceName ?? 'evolution_exchange';

          amqp.assertExchange(exchangeName, 'topic', {
            durable: true,
            autoDelete: false,
          });

          const queueName = `${this.instanceName}.${event}`;

          amqp.assertQueue(queueName, {
            durable: true,
            autoDelete: false,
            arguments: {
              'x-queue-type': 'quorum',
            },
          });

          amqp.bindQueue(queueName, exchangeName, event);

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

          amqp.publish(exchangeName, event, Buffer.from(JSON.stringify(message)));

          if (this.configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS')) {
            const logData = {
              local: WAStartupService.name + '.sendData-RabbitMQ',
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
                local: WAStartupService.name + '.sendData-SQS',
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
                  local: WAStartupService.name + '.sendData-SQS',
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

    if (this.configService.get<Websocket>('WEBSOCKET')?.ENABLED && this.localWebsocket.enabled) {
      this.logger.verbose('Sending data to websocket on channel: ' + this.instance.name);
      if (Array.isArray(websocketLocal) && websocketLocal.includes(we)) {
        this.logger.verbose('Sending data to websocket on event: ' + event);
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

        this.logger.verbose('Sending data to socket.io in channel: ' + this.instance.name);
        io.of(`/${this.instance.name}`).emit(event, message);

        if (this.configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS')) {
          const logData = {
            local: WAStartupService.name + '.sendData-Websocket',
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
            local: WAStartupService.name + '.sendDataWebhook-local',
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
            local: WAStartupService.name + '.sendDataWebhook-local',
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
            local: WAStartupService.name + '.sendDataWebhook-global',
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
            local: WAStartupService.name + '.sendDataWebhook-global',
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

  protected cleanStore() {
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

  protected cleanDB() {
    this.logger.verbose('Cronjob to clean db initialized');
    const database = this.configService.get<Database>('DATABASE');
    if (database?.CLEANING_DB_INTERVAL && database.ENABLED) {
      this.logger.verbose('Cronjob to clean db enabled');
      let data = new Date()
      data.setDate(data.getDate() - database.CLEANING_DB_INTERVAL);
      let timestamp = Math.floor(data.getTime() / 1000) as number | Long.Long;
      this.repository.message.delete({
        where: {
          owner: this.instance.name,
          messageTimestamp: { $lte: timestamp }
      }
      })
    }
  }

  // Instance Controller
  public get connectionStatus() {
    this.logger.verbose('Getting connection status');
    return this.stateConnection;
  }

  protected async defineAuthState() {
    this.logger.verbose('Defining auth state');
    const redis = this.configService.get<Redis>('REDIS');

    if (redis?.ENABLED) {
      this.logger.verbose('Redis enabled');
      this.cache.reference = this.instance.name;
      return await useMultiFileAuthStateRedisDb(this.cache);
    }
  }

  public async connectToWhatsapp(data?: any): Promise< any > {
    this.logger.verbose('Connecting to whatsapp');
    try {
      this.loadWebhook();
      this.loadChatwoot();
      this.loadWebsocket();
      this.loadRabbitmq();
      this.loadSqs();
      this.loadTypebot();
      this.loadChamaai();
      
      return 
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error?.toString());
    }
  }

}