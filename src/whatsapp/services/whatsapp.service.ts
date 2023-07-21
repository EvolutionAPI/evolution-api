import makeWASocket, {
  AnyMessageContent,
  BufferedEventData,
  BufferJSON,
  CacheStore,
  makeCacheableSignalKeyStore,
  Chat,
  ConnectionState,
  Contact,
  delay,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  generateWAMessageFromContent,
  getContentType,
  getDevice,
  GroupMetadata,
  isJidGroup,
  isJidUser,
  MessageUpsertType,
  MiscMessageGenerationOptions,
  ParticipantAction,
  prepareWAMessageMedia,
  proto,
  useMultiFileAuthState,
  UserFacingSocketConfig,
  WABrowserDescription,
  WAMediaUpload,
  WAMessage,
  WAMessageUpdate,
  WASocket,
  getAggregateVotesInPollMessage,
} from '@whiskeysockets/baileys';
import {
  Auth,
  CleanStoreConf,
  ConfigService,
  ConfigSessionPhone,
  Database,
  HttpServer,
  QrCode,
  Redis,
  Webhook,
} from '../../config/env.config';
import fs from 'fs';
import { Logger } from '../../config/logger.config';
import { INSTANCE_DIR, ROOT_DIR } from '../../config/path.config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { v4 } from 'uuid';
import qrcode, { QRCodeToDataURLOptions } from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { Events, TypeMediaMessage, wa, MessageSubtype } from '../types/wa.types';
import { Boom } from '@hapi/boom';
import EventEmitter2 from 'eventemitter2';
import { release } from 'os';
import P from 'pino';
import { execSync, exec } from 'child_process';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { RepositoryBroker } from '../repository/repository.manager';
import { MessageRaw, MessageUpdateRaw } from '../models/message.model';
import { ContactRaw } from '../models/contact.model';
import { ChatRaw } from '../models/chat.model';
import { getMIMEType } from 'node-mime-types';
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
  SendReactionDto,
  SendTextDto,
  SendPollDto,
  SendStickerDto,
  SendStatusDto,
  StatusMessage,
} from '../dto/sendMessage.dto';
import { arrayUnique, isBase64, isURL } from 'class-validator';
import {
  ArchiveChatDto,
  DeleteMessage,
  OnWhatsAppDto,
  PrivacySettingDto,
  ReadMessageDto,
  WhatsAppNumberDto,
  getBase64FromMediaMessageDto,
} from '../dto/chat.dto';
import { MessageQuery } from '../repository/message.repository';
import { ContactQuery } from '../repository/contact.repository';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../../exceptions';
import {
  CreateGroupDto,
  GroupInvite,
  GroupJid,
  GroupPictureDto,
  GroupUpdateParticipantDto,
  GroupUpdateSettingDto,
  GroupToggleEphemeralDto,
  GroupSubjectDto,
  GroupDescriptionDto,
  GroupSendInvite,
  GetParticipant,
} from '../dto/group.dto';
import { MessageUpQuery } from '../repository/messageUp.repository';
import { useMultiFileAuthStateDb } from '../../utils/use-multi-file-auth-state-db';
import Long from 'long';
import { WebhookRaw } from '../models/webhook.model';
import { ChatwootRaw } from '../models/chatwoot.model';
import { dbserver } from '../../db/db.connect';
import NodeCache from 'node-cache';
import { useMultiFileAuthStateRedisDb } from '../../utils/use-multi-file-auth-state-redis-db';
import sharp from 'sharp';
import { RedisCache } from '../../db/redis.client';
import { Log } from '../../config/env.config';
import ProxyAgent from 'proxy-agent';
import { ChatwootService } from './chatwoot.service';
import { waMonitor } from '../whatsapp.module';

export class WAStartupService {
  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly repository: RepositoryBroker,
    private readonly cache: RedisCache,
  ) {
    this.logger.verbose('WAStartupService initialized');
    this.cleanStore();
    this.instance.qrcode = { count: 0 };
  }

  private readonly logger = new Logger(WAStartupService.name);
  private readonly instance: wa.Instance = {};
  public client: WASocket;
  private readonly localWebhook: wa.LocalWebHook = {};
  private readonly localChatwoot: wa.LocalChatwoot = {};
  private stateConnection: wa.StateConnection = { state: 'close' };
  public readonly storePath = join(ROOT_DIR, 'store');
  private readonly msgRetryCounterCache: CacheStore = new NodeCache();
  private readonly userDevicesCache: CacheStore = new NodeCache();
  private endSession = false;
  private logBaileys = this.configService.get<Log>('LOG').BAILEYS;

  private chatwootService = new ChatwootService(waMonitor, this.configService);

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

  public get instanceName() {
    this.logger.verbose('Getting instance name');
    return this.instance.name;
  }

  public get wuid() {
    this.logger.verbose('Getting remoteJid of instance');
    return this.instance.wuid;
  }

  public async getProfileName() {
    this.logger.verbose('Getting profile name');
    let profileName = this.client.user?.name ?? this.client.user?.verifiedName;
    if (!profileName) {
      this.logger.verbose('Profile name not found, trying to get from database');
      if (this.configService.get<Database>('DATABASE').ENABLED) {
        this.logger.verbose('Database enabled, trying to get from database');
        const collection = dbserver
          .getClient()
          .db(
            this.configService.get<Database>('DATABASE').CONNECTION.DB_PREFIX_NAME +
              '-instances',
          )
          .collection(this.instanceName);
        const data = await collection.findOne({ _id: 'creds' });
        if (data) {
          this.logger.verbose('Profile name found in database');
          const creds = JSON.parse(JSON.stringify(data), BufferJSON.reviver);
          profileName = creds.me?.name || creds.me?.verifiedName;
        }
      } else if (existsSync(join(INSTANCE_DIR, this.instanceName, 'creds.json'))) {
        this.logger.verbose('Profile name found in file');
        const creds = JSON.parse(
          readFileSync(join(INSTANCE_DIR, this.instanceName, 'creds.json'), {
            encoding: 'utf-8',
          }),
        );
        profileName = creds.me?.name || creds.me?.verifiedName;
      }
    }

    this.logger.verbose(`Profile name: ${profileName}`);
    return profileName;
  }

  public async getProfileStatus() {
    this.logger.verbose('Getting profile status');
    const status = await this.client.fetchStatus(this.instance.wuid);

    this.logger.verbose(`Profile status: ${status.status}`);
    return status.status;
  }

  public get profilePictureUrl() {
    this.logger.verbose('Getting profile picture url');
    return this.instance.profilePictureUrl;
  }

  public get qrCode(): wa.QrCode {
    this.logger.verbose('Getting qrcode');
    return {
      code: this.instance.qrcode?.code,
      base64: this.instance.qrcode?.base64,
    };
  }

  private async loadWebhook() {
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
    return data;
  }

  private async loadChatwoot() {
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

    Object.assign(this.localChatwoot, data);
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

    return data;
  }

  public async sendDataWebhook<T = any>(event: Events, data: T, local = true) {
    const webhookGlobal = this.configService.get<Webhook>('WEBHOOK');
    const webhookLocal = this.localWebhook.events;
    const serverUrl = this.configService.get<HttpServer>('SERVER').URL;
    const we = event.replace(/[\.-]/gm, '_').toUpperCase();
    const transformedWe = we.replace(/_/gm, '-').toLowerCase();

    const expose =
      this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES;
    const tokenStore = await this.repository.auth.find(this.instanceName);
    const instanceApikey = tokenStore?.apikey || 'Apikey not found';

    const globalApiKey = this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY;

    if (local) {
      if (Array.isArray(webhookLocal) && webhookLocal.includes(we)) {
        this.logger.verbose('Sending data to webhook local');
        let baseURL;

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
            server_url: serverUrl,
            apikey: (expose && instanceApikey) || null,
          };

          if (expose && instanceApikey) {
            logData['apikey'] = instanceApikey;
          }

          this.logger.log(logData);
        }

        try {
          if (this.localWebhook.enabled && isURL(this.localWebhook.url)) {
            const httpService = axios.create({ baseURL });
            const postData = {
              event,
              instance: this.instance.name,
              data,
              destination: this.localWebhook.url,
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

  private async connectionUpdate({
    qr,
    connection,
    lastDisconnect,
  }: Partial<ConnectionState>) {
    this.logger.verbose('Connection update');
    if (qr) {
      this.logger.verbose('QR code found');
      if (this.instance.qrcode.count === this.configService.get<QrCode>('QRCODE').LIMIT) {
        this.logger.verbose('QR code limit reached');

        this.logger.verbose('Sending data to webhook in event QRCODE_UPDATED');
        this.sendDataWebhook(Events.QRCODE_UPDATED, {
          message: 'QR code limit reached, please login again',
          statusCode: DisconnectReason.badSession,
        });

        if (this.localChatwoot.enabled) {
          this.chatwootService.eventWhatsapp(
            Events.QRCODE_UPDATED,
            { instanceName: this.instance.name },
            {
              message: 'QR code limit reached, please login again',
              statusCode: DisconnectReason.badSession,
            },
          );
        }

        this.logger.verbose('Sending data to webhook in event CONNECTION_UPDATE');
        this.sendDataWebhook(Events.CONNECTION_UPDATE, {
          instance: this.instance.name,
          state: 'refused',
          statusReason: DisconnectReason.connectionClosed,
        });

        this.logger.verbose('Sending data to webhook in event STATUS_INSTANCE');
        this.sendDataWebhook(Events.STATUS_INSTANCE, {
          instance: this.instance.name,
          status: 'removed',
        });

        if (this.localChatwoot.enabled) {
          this.chatwootService.eventWhatsapp(
            Events.STATUS_INSTANCE,
            { instanceName: this.instance.name },
            {
              instance: this.instance.name,
              status: 'removed',
            },
          );
        }

        this.logger.verbose('endSession defined as true');
        this.endSession = true;

        this.logger.verbose('Emmiting event logout.instance');
        return this.eventEmitter.emit('no.connection', this.instance.name);
      }

      this.logger.verbose('Incrementing QR code count');
      this.instance.qrcode.count++;

      const optsQrcode: QRCodeToDataURLOptions = {
        margin: 3,
        scale: 4,
        errorCorrectionLevel: 'H',
        color: { light: '#ffffff', dark: '#198754' },
      };

      this.logger.verbose('Generating QR code');
      qrcode.toDataURL(qr, optsQrcode, (error, base64) => {
        if (error) {
          this.logger.error('Qrcode generate failed:' + error.toString());
          return;
        }

        this.instance.qrcode.base64 = base64;
        this.instance.qrcode.code = qr;

        this.sendDataWebhook(Events.QRCODE_UPDATED, {
          qrcode: { instance: this.instance.name, code: qr, base64 },
        });

        if (this.localChatwoot.enabled) {
          this.chatwootService.eventWhatsapp(
            Events.QRCODE_UPDATED,
            { instanceName: this.instance.name },
            {
              qrcode: { instance: this.instance.name, code: qr, base64 },
            },
          );
        }
      });

      this.logger.verbose('Generating QR code in terminal');
      qrcodeTerminal.generate(qr, { small: true }, (qrcode) =>
        this.logger.log(
          `\n{ instance: ${this.instance.name}, qrcodeCount: ${this.instance.qrcode.count} }\n` +
            qrcode,
        ),
      );
    }

    if (connection) {
      this.logger.verbose('Connection found');
      this.stateConnection = {
        state: connection,
        statusReason: (lastDisconnect?.error as Boom)?.output?.statusCode ?? 200,
      };

      this.logger.verbose('Sending data to webhook in event CONNECTION_UPDATE');
      this.sendDataWebhook(Events.CONNECTION_UPDATE, {
        instance: this.instance.name,
        ...this.stateConnection,
      });
    }

    if (connection === 'close') {
      this.logger.verbose('Connection closed');
      const shouldReconnect =
        (lastDisconnect.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        this.logger.verbose('Reconnecting to whatsapp');
        await this.connectToWhatsapp();
      } else {
        this.logger.verbose('Do not reconnect to whatsapp');
        this.logger.verbose('Sending data to webhook in event STATUS_INSTANCE');
        this.sendDataWebhook(Events.STATUS_INSTANCE, {
          instance: this.instance.name,
          status: 'removed',
        });

        if (this.localChatwoot.enabled) {
          this.chatwootService.eventWhatsapp(
            Events.STATUS_INSTANCE,
            { instanceName: this.instance.name },
            {
              instance: this.instance.name,
              status: 'removed',
            },
          );
        }

        this.logger.verbose('Emittin event logout.instance');
        this.eventEmitter.emit('logout.instance', this.instance.name, 'inner');
        this.client?.ws?.close();
        this.client.end(new Error('Close connection'));
        this.logger.verbose('Connection closed');
      }
    }

    if (connection === 'open') {
      this.logger.verbose('Connection opened');
      this.instance.wuid = this.client.user.id.replace(/:\d+/, '');
      this.instance.profilePictureUrl = (
        await this.profilePicture(this.instance.wuid)
      ).profilePictureUrl;
      this.logger.info(
        `
        ┌──────────────────────────────┐
        │    CONNECTED TO WHATSAPP     │
        └──────────────────────────────┘`.replace(/^ +/gm, '  '),
      );

      if (this.localChatwoot.enabled) {
        this.chatwootService.eventWhatsapp(
          Events.CONNECTION_UPDATE,
          { instanceName: this.instance.name },
          {
            instance: this.instance.name,
            status: 'open',
          },
        );
      }
    }
  }

  private async getMessage(key: proto.IMessageKey, full = false) {
    this.logger.verbose('Getting message with key: ' + JSON.stringify(key));
    try {
      const webMessageInfo = (await this.repository.message.find({
        where: { owner: this.instance.name, key: { id: key.id } },
      })) as unknown as proto.IWebMessageInfo[];
      if (full) {
        this.logger.verbose('Returning full message');
        return webMessageInfo[0];
      }
      if (webMessageInfo[0].message?.pollCreationMessage) {
        this.logger.verbose('Returning poll message');
        const messageSecretBase64 =
          webMessageInfo[0].message?.messageContextInfo?.messageSecret;

        if (typeof messageSecretBase64 === 'string') {
          const messageSecret = Buffer.from(messageSecretBase64, 'base64');

          const msg = {
            messageContextInfo: {
              messageSecret,
            },
            pollCreationMessage: webMessageInfo[0].message?.pollCreationMessage,
          };

          return msg;
        }
      }

      this.logger.verbose('Returning message');
      return webMessageInfo[0].message;
    } catch (error) {
      return { conversation: '' };
    }
  }

  private cleanStore() {
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
                `rm -rf ${join(
                  this.storePath,
                  key.toLowerCase().replace('_', '-'),
                  this.instance.name,
                )}/*.json`,
              );
              this.logger.verbose(
                `Cleaned ${join(
                  this.storePath,
                  key.toLowerCase().replace('_', '-'),
                  this.instance.name,
                )}/*.json`,
              );
            }
          }
        } catch (error) {}
      }, (cleanStore?.CLEANING_INTERVAL ?? 3600) * 1000);
    }
  }

  private async defineAuthState() {
    this.logger.verbose('Defining auth state');
    const db = this.configService.get<Database>('DATABASE');
    const redis = this.configService.get<Redis>('REDIS');

    if (redis?.ENABLED) {
      this.logger.verbose('Redis enabled');
      this.cache.reference = this.instance.name;
      return await useMultiFileAuthStateRedisDb(this.cache);
    }

    if (db.SAVE_DATA.INSTANCE && db.ENABLED) {
      this.logger.verbose('Database enabled');
      return await useMultiFileAuthStateDb(this.instance.name);
    }

    this.logger.verbose('Store file enabled');
    return await useMultiFileAuthState(join(INSTANCE_DIR, this.instance.name));
  }

  public async connectToWhatsapp(): Promise<WASocket> {
    this.logger.verbose('Connecting to whatsapp');
    try {
      this.loadWebhook();
      this.loadChatwoot();

      this.instance.authState = await this.defineAuthState();

      const { version } = await fetchLatestBaileysVersion();
      this.logger.verbose('Baileys version: ' + version);
      const session = this.configService.get<ConfigSessionPhone>('CONFIG_SESSION_PHONE');
      const browser: WABrowserDescription = [session.CLIENT, session.NAME, release()];
      this.logger.verbose('Browser: ' + JSON.stringify(browser));

      const socketConfig: UserFacingSocketConfig = {
        auth: {
          creds: this.instance.authState.state.creds,
          keys: makeCacheableSignalKeyStore(
            this.instance.authState.state.keys,
            P({ level: 'error' }),
          ),
        },
        logger: P({ level: this.logBaileys }),
        printQRInTerminal: false,
        browser,
        version,
        connectTimeoutMs: 60_000,
        qrTimeout: 40_000,
        defaultQueryTimeoutMs: undefined,
        emitOwnEvents: false,
        msgRetryCounterCache: this.msgRetryCounterCache,
        getMessage: async (key) =>
          (await this.getMessage(key)) as Promise<proto.IMessage>,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        userDevicesCache: this.userDevicesCache,
        transactionOpts: { maxCommitRetries: 1, delayBetweenTriesMs: 10 },
        patchMessageBeforeSending: (message) => {
          const requiresPatch = !!(
            message.buttonsMessage ||
            message.listMessage ||
            message.templateMessage
          );
          if (requiresPatch) {
            message = {
              viewOnceMessageV2: {
                message: {
                  messageContextInfo: {
                    deviceListMetadataVersion: 2,
                    deviceListMetadata: {},
                  },
                  ...message,
                },
              },
            };
          }

          return message;
        },
      };

      this.endSession = false;

      this.logger.verbose('Creating socket');

      this.client = makeWASocket(socketConfig);

      this.logger.verbose('Socket created');

      this.eventHandler();

      this.logger.verbose('Socket event handler initialized');

      return this.client;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error?.toString());
    }
  }

  private readonly chatHandle = {
    'chats.upsert': async (chats: Chat[], database: Database) => {
      this.logger.verbose('Event received: chats.upsert');

      this.logger.verbose('Finding chats in database');
      const chatsRepository = await this.repository.chat.find({
        where: { owner: this.instance.name },
      });

      this.logger.verbose('Verifying if chats exists in database to insert');
      const chatsRaw: ChatRaw[] = [];
      for await (const chat of chats) {
        if (chatsRepository.find((cr) => cr.id === chat.id)) {
          continue;
        }

        chatsRaw.push({ id: chat.id, owner: this.instance.wuid });
      }

      this.logger.verbose('Sending data to webhook in event CHATS_UPSERT');
      await this.sendDataWebhook(Events.CHATS_UPSERT, chatsRaw);

      this.logger.verbose('Inserting chats in database');
      await this.repository.chat.insert(
        chatsRaw,
        this.instance.name,
        database.SAVE_DATA.CHATS,
      );
    },

    'chats.update': async (
      chats: Partial<
        proto.IConversation & {
          lastMessageRecvTimestamp?: number;
        } & {
          conditional: (bufferedData: BufferedEventData) => boolean;
        }
      >[],
    ) => {
      this.logger.verbose('Event received: chats.update');
      const chatsRaw: ChatRaw[] = chats.map((chat) => {
        return { id: chat.id, owner: this.instance.wuid };
      });

      this.logger.verbose('Sending data to webhook in event CHATS_UPDATE');
      await this.sendDataWebhook(Events.CHATS_UPDATE, chatsRaw);
    },

    'chats.delete': async (chats: string[]) => {
      this.logger.verbose('Event received: chats.delete');

      this.logger.verbose('Deleting chats in database');
      chats.forEach(
        async (chat) =>
          await this.repository.chat.delete({
            where: { owner: this.instance.name, id: chat },
          }),
      );

      this.logger.verbose('Sending data to webhook in event CHATS_DELETE');
      await this.sendDataWebhook(Events.CHATS_DELETE, [...chats]);
    },
  };

  private readonly contactHandle = {
    'contacts.upsert': async (contacts: Contact[], database: Database) => {
      this.logger.verbose('Event received: contacts.upsert');

      this.logger.verbose('Finding contacts in database');
      const contactsRepository = await this.repository.contact.find({
        where: { owner: this.instance.name },
      });

      this.logger.verbose('Verifying if contacts exists in database to insert');
      const contactsRaw: ContactRaw[] = [];
      for await (const contact of contacts) {
        if (contactsRepository.find((cr) => cr.id === contact.id)) {
          continue;
        }

        contactsRaw.push({
          id: contact.id,
          pushName: contact?.name || contact?.verifiedName,
          profilePictureUrl: (await this.profilePicture(contact.id)).profilePictureUrl,
          owner: this.instance.name,
        });
      }

      this.logger.verbose('Sending data to webhook in event CONTACTS_UPSERT');
      await this.sendDataWebhook(Events.CONTACTS_UPSERT, contactsRaw);

      this.logger.verbose('Inserting contacts in database');
      await this.repository.contact.insert(
        contactsRaw,
        this.instance.name,
        database.SAVE_DATA.CONTACTS,
      );
    },

    'contacts.update': async (contacts: Partial<Contact>[], database: Database) => {
      this.logger.verbose('Event received: contacts.update');

      this.logger.verbose('Verifying if contacts exists in database to update');
      const contactsRaw: ContactRaw[] = [];
      for await (const contact of contacts) {
        contactsRaw.push({
          id: contact.id,
          pushName: contact?.name ?? contact?.verifiedName,
          profilePictureUrl: (await this.profilePicture(contact.id)).profilePictureUrl,
          owner: this.instance.name,
        });
      }

      this.logger.verbose('Sending data to webhook in event CONTACTS_UPDATE');
      await this.sendDataWebhook(Events.CONTACTS_UPDATE, contactsRaw);

      this.logger.verbose('Updating contacts in database');
      await this.repository.contact.update(
        contactsRaw,
        this.instance.name,
        database.SAVE_DATA.CONTACTS,
      );
    },
  };

  private readonly messageHandle = {
    'messaging-history.set': async (
      {
        messages,
        chats,
        isLatest,
      }: {
        chats: Chat[];
        contacts: Contact[];
        messages: proto.IWebMessageInfo[];
        isLatest: boolean;
      },
      database: Database,
    ) => {
      this.logger.verbose('Event received: messaging-history.set');
      if (isLatest) {
        this.logger.verbose('isLatest defined as true');
        const chatsRaw: ChatRaw[] = chats.map((chat) => {
          return {
            id: chat.id,
            owner: this.instance.name,
            lastMsgTimestamp: chat.lastMessageRecvTimestamp,
          };
        });

        this.logger.verbose('Sending data to webhook in event CHATS_SET');
        await this.sendDataWebhook(Events.CHATS_SET, chatsRaw);

        this.logger.verbose('Inserting chats in database');
        await this.repository.chat.insert(
          chatsRaw,
          this.instance.name,
          database.SAVE_DATA.CHATS,
        );
      }

      const messagesRaw: MessageRaw[] = [];
      const messagesRepository = await this.repository.message.find({
        where: { owner: this.instance.name },
      });
      for await (const [, m] of Object.entries(messages)) {
        if (!m.message) {
          continue;
        }
        if (
          messagesRepository.find(
            (mr) => mr.owner === this.instance.name && mr.key.id === m.key.id,
          )
        ) {
          continue;
        }

        if (Long.isLong(m?.messageTimestamp)) {
          m.messageTimestamp = m.messageTimestamp?.toNumber();
        }

        messagesRaw.push({
          key: m.key,
          pushName: m.pushName,
          participant: m.participant,
          message: { ...m.message },
          messageType: getContentType(m.message),
          messageTimestamp: m.messageTimestamp as number,
          owner: this.instance.name,
        });
      }

      this.logger.verbose('Sending data to webhook in event MESSAGES_SET');
      this.sendDataWebhook(Events.MESSAGES_SET, [...messagesRaw]);

      messages = undefined;
    },

    'messages.upsert': async (
      {
        messages,
        type,
      }: {
        messages: proto.IWebMessageInfo[];
        type: MessageUpsertType;
      },
      database: Database,
    ) => {
      this.logger.verbose('Event received: messages.upsert');
      const received = messages[0];

      if (
        type !== 'notify' ||
        received.message?.protocolMessage ||
        received.message?.pollUpdateMessage
      ) {
        this.logger.verbose('message rejected');
        return;
      }

      if (Long.isLong(received.messageTimestamp)) {
        received.messageTimestamp = received.messageTimestamp?.toNumber();
      }

      const messageRaw: MessageRaw = {
        key: received.key,
        pushName: received.pushName,
        message: { ...received.message },
        messageType: getContentType(received.message),
        messageTimestamp: received.messageTimestamp as number,
        owner: this.instance.name,
        source: getDevice(received.key.id),
      };

      this.logger.log(messageRaw);

      this.logger.verbose('Sending data to webhook in event MESSAGES_UPSERT');
      await this.sendDataWebhook(Events.MESSAGES_UPSERT, messageRaw);

      if (this.localChatwoot.enabled) {
        await this.chatwootService.eventWhatsapp(
          Events.MESSAGES_UPSERT,
          { instanceName: this.instance.name },
          messageRaw,
        );
      }

      this.logger.verbose('Inserting message in database');
      await this.repository.message.insert(
        [messageRaw],
        this.instance.name,
        database.SAVE_DATA.NEW_MESSAGE,
      );

      this.logger.verbose('Verifying contact from message');
      const contact = await this.repository.contact.find({
        where: { owner: this.instance.name, id: received.key.remoteJid },
      });

      const contactRaw: ContactRaw = {
        id: received.key.remoteJid,
        pushName: received.pushName,
        profilePictureUrl: (await this.profilePicture(received.key.remoteJid))
          .profilePictureUrl,
        owner: this.instance.name,
      };

      if (contactRaw.id === 'status@broadcast') {
        this.logger.verbose('Contact is status@broadcast');
        return;
      }

      if (contact?.length) {
        this.logger.verbose('Contact found in database');
        const contactRaw: ContactRaw = {
          id: received.key.remoteJid,
          pushName: contact[0].pushName,
          profilePictureUrl: (await this.profilePicture(received.key.remoteJid))
            .profilePictureUrl,
          owner: this.instance.name,
        };

        this.logger.verbose('Sending data to webhook in event CONTACTS_UPDATE');
        await this.sendDataWebhook(Events.CONTACTS_UPDATE, contactRaw);

        if (this.localChatwoot.enabled) {
          await this.chatwootService.eventWhatsapp(
            Events.CONTACTS_UPDATE,
            { instanceName: this.instance.name },
            contactRaw,
          );
        }

        this.logger.verbose('Updating contact in database');
        await this.repository.contact.update(
          [contactRaw],
          this.instance.name,
          database.SAVE_DATA.CONTACTS,
        );
        return;
      }

      this.logger.verbose('Contact not found in database');

      this.logger.verbose('Sending data to webhook in event CONTACTS_UPSERT');
      await this.sendDataWebhook(Events.CONTACTS_UPSERT, contactRaw);

      this.logger.verbose('Inserting contact in database');
      await this.repository.contact.insert(
        [contactRaw],
        this.instance.name,
        database.SAVE_DATA.CONTACTS,
      );
    },

    'messages.update': async (args: WAMessageUpdate[], database: Database) => {
      this.logger.verbose('Event received: messages.update');
      const status: Record<number, wa.StatusMessage> = {
        0: 'ERROR',
        1: 'PENDING',
        2: 'SERVER_ACK',
        3: 'DELIVERY_ACK',
        4: 'READ',
        5: 'PLAYED',
      };
      for await (const { key, update } of args) {
        if (key.remoteJid !== 'status@broadcast' && !key?.remoteJid?.match(/(:\d+)/)) {
          this.logger.verbose('Message update is valid');

          let pollUpdates: any;
          if (update.pollUpdates) {
            this.logger.verbose('Poll update found');

            this.logger.verbose('Getting poll message');
            const pollCreation = await this.getMessage(key);
            this.logger.verbose(pollCreation);

            if (pollCreation) {
              this.logger.verbose('Getting aggregate votes in poll message');
              pollUpdates = getAggregateVotesInPollMessage({
                message: pollCreation as proto.IMessage,
                pollUpdates: update.pollUpdates,
              });
            }
          }

          if (status[update.status] === 'READ' && !key.fromMe) return;

          if (update.message === null && update.status === undefined) {
            this.logger.verbose('Message deleted');

            this.logger.verbose('Sending data to webhook in event MESSAGE_DELETE');
            await this.sendDataWebhook(Events.MESSAGES_DELETE, key);

            const message: MessageUpdateRaw = {
              ...key,
              status: 'DELETED',
              datetime: Date.now(),
              owner: this.instance.name,
            };

            this.logger.verbose(message);

            this.logger.verbose('Inserting message in database');
            await this.repository.messageUpdate.insert(
              [message],
              this.instance.name,
              database.SAVE_DATA.MESSAGE_UPDATE,
            );
            return;
          }

          const message: MessageUpdateRaw = {
            ...key,
            status: status[update.status],
            datetime: Date.now(),
            owner: this.instance.name,
            pollUpdates,
          };

          this.logger.verbose(message);

          this.logger.verbose('Sending data to webhook in event MESSAGES_UPDATE');
          await this.sendDataWebhook(Events.MESSAGES_UPDATE, message);

          this.logger.verbose('Inserting message in database');
          await this.repository.messageUpdate.insert(
            [message],
            this.instance.name,
            database.SAVE_DATA.MESSAGE_UPDATE,
          );
        }
      }
    },
  };

  private readonly groupHandler = {
    'groups.upsert': (groupMetadata: GroupMetadata[]) => {
      this.logger.verbose('Event received: groups.upsert');

      this.logger.verbose('Sending data to webhook in event GROUPS_UPSERT');
      this.sendDataWebhook(Events.GROUPS_UPSERT, groupMetadata);
    },

    'groups.update': (groupMetadataUpdate: Partial<GroupMetadata>[]) => {
      this.logger.verbose('Event received: groups.update');

      this.logger.verbose('Sending data to webhook in event GROUPS_UPDATE');
      this.sendDataWebhook(Events.GROUPS_UPDATE, groupMetadataUpdate);
    },

    'group-participants.update': (participantsUpdate: {
      id: string;
      participants: string[];
      action: ParticipantAction;
    }) => {
      this.logger.verbose('Event received: group-participants.update');

      this.logger.verbose('Sending data to webhook in event GROUP_PARTICIPANTS_UPDATE');
      this.sendDataWebhook(Events.GROUP_PARTICIPANTS_UPDATE, participantsUpdate);
    },
  };

  private eventHandler() {
    this.logger.verbose('Initializing event handler');
    this.client.ev.process((events) => {
      if (!this.endSession) {
        const database = this.configService.get<Database>('DATABASE');

        if (events['connection.update']) {
          this.logger.verbose('Listening event: connection.update');
          this.connectionUpdate(events['connection.update']);
        }

        if (events['creds.update']) {
          this.logger.verbose('Listening event: creds.update');
          this.instance.authState.saveCreds();
        }

        if (events['messaging-history.set']) {
          this.logger.verbose('Listening event: messaging-history.set');
          const payload = events['messaging-history.set'];
          this.messageHandle['messaging-history.set'](payload, database);
        }

        if (events['messages.upsert']) {
          this.logger.verbose('Listening event: messages.upsert');
          const payload = events['messages.upsert'];
          this.messageHandle['messages.upsert'](payload, database);
        }

        if (events['messages.update']) {
          this.logger.verbose('Listening event: messages.update');
          const payload = events['messages.update'];
          this.messageHandle['messages.update'](payload, database);
        }

        if (events['presence.update']) {
          this.logger.verbose('Listening event: presence.update');
          const payload = events['presence.update'];
          this.sendDataWebhook(Events.PRESENCE_UPDATE, payload);
        }

        if (events['groups.upsert']) {
          this.logger.verbose('Listening event: groups.upsert');
          const payload = events['groups.upsert'];
          this.groupHandler['groups.upsert'](payload);
        }

        if (events['groups.update']) {
          this.logger.verbose('Listening event: groups.update');
          const payload = events['groups.update'];
          this.groupHandler['groups.update'](payload);
        }

        if (events['group-participants.update']) {
          this.logger.verbose('Listening event: group-participants.update');
          const payload = events['group-participants.update'];
          this.groupHandler['group-participants.update'](payload);
        }

        if (events['chats.upsert']) {
          this.logger.verbose('Listening event: chats.upsert');
          const payload = events['chats.upsert'];
          this.chatHandle['chats.upsert'](payload, database);
        }

        if (events['chats.update']) {
          this.logger.verbose('Listening event: chats.update');
          const payload = events['chats.update'];
          this.chatHandle['chats.update'](payload);
        }

        if (events['chats.delete']) {
          this.logger.verbose('Listening event: chats.delete');
          const payload = events['chats.delete'];
          this.chatHandle['chats.delete'](payload);
        }

        if (events['contacts.upsert']) {
          this.logger.verbose('Listening event: contacts.upsert');
          const payload = events['contacts.upsert'];
          this.contactHandle['contacts.upsert'](payload, database);
        }

        if (events['contacts.update']) {
          this.logger.verbose('Listening event: contacts.update');
          const payload = events['contacts.update'];
          this.contactHandle['contacts.update'](payload, database);
        }
      }
    });
  }

  // Check if the number is MX or AR
  private formatMXOrARNumber(jid: string): string {
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
  private formatBRNumber(jid: string) {
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

  private createJid(number: string): string {
    this.logger.verbose('Creating jid with number: ' + number);

    if (number.includes('@g.us') || number.includes('@s.whatsapp.net')) {
      this.logger.verbose('Number already contains @g.us or @s.whatsapp.net');
      return number;
    }

    if (number.includes('@broadcast')) {
      this.logger.verbose('Number already contains @broadcast');
      return number;
    }

    const countryCode = number.substring(0, 2);

    if (Number(countryCode) === 55) {
      const formattedBRNumber = this.formatBRNumber(number);
      if (formattedBRNumber !== number) {
        this.logger.verbose(
          'Jid created is whatsapp in format BR: ' +
            `${formattedBRNumber}@s.whatsapp.net`,
        );
        return `${formattedBRNumber}@s.whatsapp.net`;
      }
    }

    if (Number(countryCode) === 52 || Number(countryCode) === 54) {
      const formattedMXARNumber = this.formatMXOrARNumber(number);

      if (formattedMXARNumber !== number) {
        this.logger.verbose(
          'Jid created is whatsapp in format MXAR: ' +
            `${formattedMXARNumber}@s.whatsapp.net`,
        );
        return `${formattedMXARNumber}@s.whatsapp.net`;
      }
    }

    if (number.includes('-')) {
      this.logger.verbose('Jid created is group: ' + `${number}@g.us`);
      return `${number}@g.us`;
    }

    this.logger.verbose('Jid created is whatsapp: ' + `${number}@s.whatsapp.net`);
    return `${number}@s.whatsapp.net`;
  }

  public async profilePicture(number: string) {
    const jid = this.createJid(number);

    this.logger.verbose('Getting profile picture with jid: ' + jid);
    try {
      this.logger.verbose('Getting profile picture url');
      return {
        wuid: jid,
        profilePictureUrl: await this.client.profilePictureUrl(jid, 'image'),
      };
    } catch (error) {
      this.logger.verbose('Profile picture not found');
      return {
        wuid: jid,
        profilePictureUrl: null,
      };
    }
  }

  private async sendMessageWithTyping<T = proto.IMessage>(
    number: string,
    message: T,
    options?: Options,
  ) {
    this.logger.verbose('Sending message with typing');

    const jid = this.createJid(number);
    const numberWA = await this.whatsappNumber({ numbers: [jid] });
    const isWA = numberWA[0];

    if (!isWA.exists && !isJidGroup(isWA.jid) && !isWA.jid.includes('@broadcast')) {
      throw new BadRequestException(isWA);
    }

    const sender = isJidGroup(jid) ? jid : isWA.jid;

    try {
      if (options?.delay) {
        this.logger.verbose('Delaying message');

        await this.client.presenceSubscribe(sender);
        this.logger.verbose('Subscribing to presence');

        await this.client.sendPresenceUpdate(options?.presence ?? 'composing', jid);
        this.logger.verbose(
          'Sending presence update: ' + options?.presence ?? 'composing',
        );

        await delay(options.delay);
        this.logger.verbose('Set delay: ' + options.delay);

        await this.client.sendPresenceUpdate('paused', sender);
        this.logger.verbose('Sending presence update: paused');
      }

      let quoted: WAMessage;

      if (options?.quoted) {
        const m = options?.quoted;

        const msg = m?.message
          ? m
          : ((await this.getMessage(m.key, true)) as proto.IWebMessageInfo);

        if (!msg) {
          throw 'Message not found';
        }

        quoted = msg;
        this.logger.verbose('Quoted message');
      }

      let mentions: string[];
      if (isJidGroup(sender)) {
        try {
          const groupMetadata = await this.client.groupMetadata(sender);

          if (!groupMetadata) {
            throw new NotFoundException('Group not found');
          }

          if (options?.mentions) {
            this.logger.verbose('Mentions defined');

            if (
              !Array.isArray(options.mentions.mentioned) &&
              !options.mentions.everyOne
            ) {
              throw new BadRequestException('Mentions must be an array');
            }

            if (options.mentions.everyOne) {
              this.logger.verbose('Mentions everyone');

              this.logger.verbose('Getting group metadata');
              mentions = groupMetadata.participants.map((participant) => participant.id);
              this.logger.verbose('Getting group metadata for mentions');
            } else {
              this.logger.verbose('Mentions manually defined');
              mentions = options.mentions.mentioned.map((mention) => {
                const jid = this.createJid(mention);
                if (isJidGroup(jid)) {
                  throw new BadRequestException('Mentions must be a number');
                }
                return jid;
              });
            }
          }
        } catch (error) {
          throw new NotFoundException('Group not found');
        }
      }

      const messageSent = await (async () => {
        const option = {
          quoted,
        };

        if (
          !message['audio'] &&
          !message['poll'] &&
          !message['sticker'] &&
          !message['conversation'] &&
          sender !== 'status@broadcast'
        ) {
          if (!message['audio']) {
            this.logger.verbose('Sending message');
            return await this.client.sendMessage(
              sender,
              {
                forward: {
                  key: { remoteJid: this.instance.wuid, fromMe: true },
                  message,
                },
                mentions,
              },
              option as unknown as MiscMessageGenerationOptions,
            );
          }
        }

        if (message['conversation']) {
          this.logger.verbose('Sending message');
          return await this.client.sendMessage(
            sender,
            {
              text: message['conversation'],
              mentions,
            } as unknown as AnyMessageContent,
            option as unknown as MiscMessageGenerationOptions,
          );
        }

        if (sender === 'status@broadcast') {
          this.logger.verbose('Sending message');
          return await this.client.sendMessage(
            sender,
            message['status'].content as unknown as AnyMessageContent,
            {
              backgroundColor: message['status'].option.backgroundColor,
              font: message['status'].option.font,
              statusJidList: message['status'].option.statusJidList,
            } as unknown as MiscMessageGenerationOptions,
          );
        }

        this.logger.verbose('Sending message');
        return await this.client.sendMessage(
          sender,
          message as unknown as AnyMessageContent,
          option as unknown as MiscMessageGenerationOptions,
        );
      })();

      const messageRaw: MessageRaw = {
        key: messageSent.key,
        pushName: messageSent.pushName,
        message: { ...messageSent.message },
        messageType: getContentType(messageSent.message),
        messageTimestamp: messageSent.messageTimestamp as number,
        owner: this.instance.name,
        source: getDevice(messageSent.key.id),
      };

      this.logger.log(messageRaw);

      this.logger.verbose('Sending data to webhook in event SEND_MESSAGE');
      await this.sendDataWebhook(Events.SEND_MESSAGE, messageRaw);

      // if (this.localChatwoot.enabled) {
      //   this.chatwootService.eventWhatsapp(
      //     Events.SEND_MESSAGE,
      //     { instanceName: this.instance.name },
      //     messageRaw,
      //   );
      // }

      this.logger.verbose('Inserting message in database');
      await this.repository.message.insert(
        [messageRaw],
        this.instance.name,
        this.configService.get<Database>('DATABASE').SAVE_DATA.NEW_MESSAGE,
      );

      return messageSent;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
  }

  // Instance Controller
  public get connectionStatus() {
    this.logger.verbose('Getting connection status');
    return this.stateConnection;
  }

  // Send Message Controller
  public async textMessage(data: SendTextDto) {
    this.logger.verbose('Sending text message');
    return await this.sendMessageWithTyping(
      data.number,
      {
        conversation: data.textMessage.text,
      },
      data?.options,
    );
  }

  public async pollMessage(data: SendPollDto) {
    this.logger.verbose('Sending poll message');
    return await this.sendMessageWithTyping(
      data.number,
      {
        poll: {
          name: data.pollMessage.name,
          selectableCount: data.pollMessage.selectableCount,
          values: data.pollMessage.values,
        },
      },
      data?.options,
    );
  }

  private async formatStatusMessage(status: StatusMessage) {
    this.logger.verbose('Formatting status message');

    if (!status.type) {
      throw new BadRequestException('Type is required');
    }

    if (!status.content) {
      throw new BadRequestException('Content is required');
    }

    if (status.allContacts) {
      this.logger.verbose('All contacts defined as true');

      this.logger.verbose('Getting contacts from database');
      const contacts = await this.repository.contact.find({
        where: { owner: this.instance.name },
      });

      if (!contacts.length) {
        throw new BadRequestException('Contacts not found');
      }

      this.logger.verbose('Getting contacts with push name');
      status.statusJidList = contacts
        .filter((contact) => contact.pushName)
        .map((contact) => contact.id);

      this.logger.verbose(status.statusJidList);
    }

    if (!status.statusJidList?.length && !status.allContacts) {
      throw new BadRequestException('StatusJidList is required');
    }

    if (status.type === 'text') {
      this.logger.verbose('Type defined as text');

      if (!status.backgroundColor) {
        throw new BadRequestException('Background color is required');
      }

      if (!status.font) {
        throw new BadRequestException('Font is required');
      }

      return {
        content: {
          text: status.content,
        },
        option: {
          backgroundColor: status.backgroundColor,
          font: status.font,
          statusJidList: status.statusJidList,
        },
      };
    }
    if (status.type === 'image') {
      this.logger.verbose('Type defined as image');

      return {
        content: {
          image: {
            url: status.content,
          },
          caption: status.caption,
        },
        option: {
          statusJidList: status.statusJidList,
        },
      };
    }
    if (status.type === 'video') {
      this.logger.verbose('Type defined as video');

      return {
        content: {
          video: {
            url: status.content,
          },
          caption: status.caption,
        },
        option: {
          statusJidList: status.statusJidList,
        },
      };
    }
    if (status.type === 'audio') {
      this.logger.verbose('Type defined as audio');

      this.logger.verbose('Processing audio');
      const convert = await this.processAudio(status.content, 'status@broadcast');
      if (typeof convert === 'string') {
        this.logger.verbose('Audio processed');
        const audio = fs.readFileSync(convert).toString('base64');

        const result = {
          content: {
            audio: Buffer.from(audio, 'base64'),
            ptt: true,
            mimetype: 'audio/mp4',
          },
          option: {
            statusJidList: status.statusJidList,
          },
        };

        fs.unlinkSync(convert);

        return result;
      } else {
        throw new InternalServerErrorException(convert);
      }
    }

    throw new BadRequestException('Type not found');
  }

  public async statusMessage(data: SendStatusDto) {
    this.logger.verbose('Sending status message');
    const status = await this.formatStatusMessage(data.statusMessage);

    return await this.sendMessageWithTyping('status@broadcast', {
      status,
    });
  }

  private async prepareMediaMessage(mediaMessage: MediaMessage) {
    try {
      this.logger.verbose('Preparing media message');
      const prepareMedia = await prepareWAMessageMedia(
        {
          [mediaMessage.mediatype]: isURL(mediaMessage.media)
            ? { url: mediaMessage.media }
            : Buffer.from(mediaMessage.media, 'base64'),
        } as any,
        { upload: this.client.waUploadToServer },
      );

      const mediaType = mediaMessage.mediatype + 'Message';
      this.logger.verbose('Media type: ' + mediaType);

      if (mediaMessage.mediatype === 'document' && !mediaMessage.fileName) {
        this.logger.verbose(
          'If media type is document and file name is not defined then',
        );
        const regex = new RegExp(/.*\/(.+?)\./);
        const arrayMatch = regex.exec(mediaMessage.media);
        mediaMessage.fileName = arrayMatch[1];
        this.logger.verbose('File name: ' + mediaMessage.fileName);
      }

      let mimetype: string;

      if (isURL(mediaMessage.media)) {
        mimetype = getMIMEType(mediaMessage.media);
      } else {
        mimetype = getMIMEType(mediaMessage.fileName);
      }

      this.logger.verbose('Mimetype: ' + mimetype);

      prepareMedia[mediaType].caption = mediaMessage?.caption;
      prepareMedia[mediaType].mimetype = mimetype;
      prepareMedia[mediaType].fileName = mediaMessage.fileName;

      if (mediaMessage.mediatype === 'video') {
        this.logger.verbose('Is media type video then set gif playback as false');
        prepareMedia[mediaType].jpegThumbnail = Uint8Array.from(
          readFileSync(join(process.cwd(), 'public', 'images', 'video-cover.png')),
        );
        prepareMedia[mediaType].gifPlayback = false;
      }

      this.logger.verbose('Generating wa message from content');
      return generateWAMessageFromContent(
        '',
        { [mediaType]: { ...prepareMedia[mediaType] } },
        { userJid: this.instance.wuid },
      );
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException(error?.toString() || error);
    }
  }

  private async convertToWebP(image: string, number: string) {
    try {
      this.logger.verbose('Converting image to WebP to sticker');

      let imagePath: string;
      const hash = `${number}-${new Date().getTime()}`;
      this.logger.verbose('Hash to image name: ' + hash);

      const outputPath = `${join(this.storePath, 'temp', `${hash}.webp`)}`;
      this.logger.verbose('Output path: ' + outputPath);

      if (isBase64(image)) {
        this.logger.verbose('Image is base64');

        const base64Data = image.replace(/^data:image\/(jpeg|png|gif);base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        imagePath = `${join(this.storePath, 'temp', `temp-${hash}.png`)}`;
        this.logger.verbose('Image path: ' + imagePath);

        await sharp(imageBuffer).toFile(imagePath);
        this.logger.verbose('Image created');
      } else {
        this.logger.verbose('Image is url');

        const timestamp = new Date().getTime();
        const url = `${image}?timestamp=${timestamp}`;
        this.logger.verbose('including timestamp in url: ' + url);

        const response = await axios.get(url, { responseType: 'arraybuffer' });
        this.logger.verbose('Getting image from url');

        const imageBuffer = Buffer.from(response.data, 'binary');
        imagePath = `${join(this.storePath, 'temp', `temp-${hash}.png`)}`;
        this.logger.verbose('Image path: ' + imagePath);

        await sharp(imageBuffer).toFile(imagePath);
        this.logger.verbose('Image created');
      }

      await sharp(imagePath).webp().toFile(outputPath);
      this.logger.verbose('Image converted to WebP');

      fs.unlinkSync(imagePath);
      this.logger.verbose('Temp image deleted');

      return outputPath;
    } catch (error) {
      console.error('Erro ao converter a imagem para WebP:', error);
    }
  }

  public async mediaSticker(data: SendStickerDto) {
    this.logger.verbose('Sending media sticker');
    const convert = await this.convertToWebP(data.stickerMessage.image, data.number);
    const result = await this.sendMessageWithTyping(
      data.number,
      {
        sticker: { url: convert },
      },
      data?.options,
    );

    fs.unlinkSync(convert);
    this.logger.verbose('Converted image deleted');

    return result;
  }

  public async mediaMessage(data: SendMediaDto) {
    this.logger.verbose('Sending media message');
    const generate = await this.prepareMediaMessage(data.mediaMessage);

    return await this.sendMessageWithTyping(
      data.number,
      { ...generate.message },
      data?.options,
    );
  }

  private async processAudio(audio: string, number: string) {
    this.logger.verbose('Processing audio');
    let tempAudioPath: string;
    let outputAudio: string;

    const hash = `${number}-${new Date().getTime()}`;
    this.logger.verbose('Hash to audio name: ' + hash);

    if (isURL(audio)) {
      this.logger.verbose('Audio is url');

      outputAudio = `${join(this.storePath, 'temp', `${hash}.mp4`)}`;
      tempAudioPath = `${join(this.storePath, 'temp', `temp-${hash}.mp3`)}`;

      this.logger.verbose('Output audio path: ' + outputAudio);
      this.logger.verbose('Temp audio path: ' + tempAudioPath);

      const timestamp = new Date().getTime();
      const url = `${audio}?timestamp=${timestamp}`;

      this.logger.verbose('Including timestamp in url: ' + url);

      const response = await axios.get(url, { responseType: 'arraybuffer' });
      this.logger.verbose('Getting audio from url');

      fs.writeFileSync(tempAudioPath, response.data);
    } else {
      this.logger.verbose('Audio is base64');

      outputAudio = `${join(this.storePath, 'temp', `${hash}.mp4`)}`;
      tempAudioPath = `${join(this.storePath, 'temp', `temp-${hash}.mp3`)}`;

      this.logger.verbose('Output audio path: ' + outputAudio);
      this.logger.verbose('Temp audio path: ' + tempAudioPath);

      const audioBuffer = Buffer.from(audio, 'base64');
      fs.writeFileSync(tempAudioPath, audioBuffer);
      this.logger.verbose('Temp audio created');
    }

    this.logger.verbose('Converting audio to mp4');
    return new Promise((resolve, reject) => {
      exec(
        `${ffmpegPath.path} -i ${tempAudioPath} -vn -ab 128k -ar 44100 -f ipod ${outputAudio} -y`,
        (error, _stdout, _stderr) => {
          fs.unlinkSync(tempAudioPath);
          this.logger.verbose('Temp audio deleted');

          if (error) reject(error);

          this.logger.verbose('Audio converted to mp4');
          resolve(outputAudio);
        },
      );
    });
  }

  public async audioWhatsapp(data: SendAudioDto) {
    this.logger.verbose('Sending audio whatsapp');
    const convert = await this.processAudio(data.audioMessage.audio, data.number);
    if (typeof convert === 'string') {
      const audio = fs.readFileSync(convert).toString('base64');
      const result = this.sendMessageWithTyping<AnyMessageContent>(
        data.number,
        {
          audio: Buffer.from(audio, 'base64'),
          ptt: true,
          mimetype: 'audio/mp4',
        },
        { presence: 'recording', delay: data?.options?.delay },
      );

      fs.unlinkSync(convert);
      this.logger.verbose('Converted audio deleted');

      return result;
    } else {
      throw new InternalServerErrorException(convert);
    }
  }

  public async buttonMessage(data: SendButtonDto) {
    this.logger.verbose('Sending button message');
    const embeddedMedia: any = {};
    let mediatype = 'TEXT';

    if (data.buttonMessage?.mediaMessage) {
      mediatype = data.buttonMessage.mediaMessage?.mediatype.toUpperCase() ?? 'TEXT';
      embeddedMedia.mediaKey = mediatype.toLowerCase() + 'Message';
      const generate = await this.prepareMediaMessage(data.buttonMessage.mediaMessage);
      embeddedMedia.message = generate.message[embeddedMedia.mediaKey];
      embeddedMedia.contentText = `*${data.buttonMessage.title}*\n\n${data.buttonMessage.description}`;
    }

    const btnItems = {
      text: data.buttonMessage.buttons.map((btn) => btn.buttonText),
      ids: data.buttonMessage.buttons.map((btn) => btn.buttonId),
    };

    if (!arrayUnique(btnItems.text) || !arrayUnique(btnItems.ids)) {
      throw new BadRequestException(
        'Button texts cannot be repeated',
        'Button IDs cannot be repeated.',
      );
    }

    return await this.sendMessageWithTyping(
      data.number,
      {
        buttonsMessage: {
          text: !embeddedMedia?.mediaKey ? data.buttonMessage.title : undefined,
          contentText: embeddedMedia?.contentText ?? data.buttonMessage.description,
          footerText: data.buttonMessage?.footerText,
          buttons: data.buttonMessage.buttons.map((button) => {
            return {
              buttonText: {
                displayText: button.buttonText,
              },
              buttonId: button.buttonId,
              type: 1,
            };
          }),
          headerType: proto.Message.ButtonsMessage.HeaderType[mediatype],
          [embeddedMedia?.mediaKey]: embeddedMedia?.message,
        },
      },
      data?.options,
    );
  }

  public async locationMessage(data: SendLocationDto) {
    this.logger.verbose('Sending location message');
    return await this.sendMessageWithTyping(
      data.number,
      {
        locationMessage: {
          degreesLatitude: data.locationMessage.latitude,
          degreesLongitude: data.locationMessage.longitude,
          name: data.locationMessage?.name,
          address: data.locationMessage?.address,
        },
      },
      data?.options,
    );
  }

  public async listMessage(data: SendListDto) {
    this.logger.verbose('Sending list message');
    return await this.sendMessageWithTyping(
      data.number,
      {
        listMessage: {
          title: data.listMessage.title,
          description: data.listMessage.description,
          buttonText: data.listMessage?.buttonText,
          footerText: data.listMessage?.footerText,
          sections: data.listMessage.sections,
          listType: 1,
        },
      },
      data?.options,
    );
  }

  public async contactMessage(data: SendContactDto) {
    this.logger.verbose('Sending contact message');
    const message: proto.IMessage = {};

    const vcard = (contact: ContactMessage) => {
      this.logger.verbose('Creating vcard');
      let result =
        'BEGIN:VCARD\n' +
        'VERSION:3.0\n' +
        `N:${contact.fullName}\n` +
        `FN:${contact.fullName}\n`;

      if (contact.organization) {
        this.logger.verbose('Organization defined');
        result += `ORG:${contact.organization};\n`;
      }

      if (contact.email) {
        this.logger.verbose('Email defined');
        result += `EMAIL:${contact.email}\n`;
      }

      if (contact.url) {
        this.logger.verbose('Url defined');
        result += `URL:${contact.url}\n`;
      }

      result +=
        `item1.TEL;waid=${contact.wuid}:${contact.phoneNumber}\n` +
        'item1.X-ABLabel:Celular\n' +
        'END:VCARD';

      this.logger.verbose('Vcard created');
      return result;
    };

    if (data.contactMessage.length === 1) {
      message.contactMessage = {
        displayName: data.contactMessage[0].fullName,
        vcard: vcard(data.contactMessage[0]),
      };
    } else {
      message.contactsArrayMessage = {
        displayName: `${data.contactMessage.length} contacts`,
        contacts: data.contactMessage.map((contact) => {
          return {
            displayName: contact.fullName,
            vcard: vcard(contact),
          };
        }),
      };
    }

    return await this.sendMessageWithTyping(data.number, { ...message }, data?.options);
  }

  public async reactionMessage(data: SendReactionDto) {
    this.logger.verbose('Sending reaction message');
    return await this.sendMessageWithTyping(data.reactionMessage.key.remoteJid, {
      reactionMessage: {
        key: data.reactionMessage.key,
        text: data.reactionMessage.reaction,
      },
    });
  }

  // Chat Controller
  public async whatsappNumber(data: WhatsAppNumberDto) {
    this.logger.verbose('Getting whatsapp number');

    const onWhatsapp: OnWhatsAppDto[] = [];
    for await (const number of data.numbers) {
      const jid = this.createJid(number);
      // const jid = `${number}@s.whatsapp.net`;
      if (isJidGroup(jid)) {
        const group = await this.findGroup({ groupJid: jid }, 'inner');

        if (!group) throw new BadRequestException('Group not found');

        onWhatsapp.push(new OnWhatsAppDto(group.id, !!group?.id, group?.subject));
      } else {
        const verify = await this.client.onWhatsApp(jid);

        const result = verify[0];

        if (!result) {
          onWhatsapp.push(new OnWhatsAppDto(jid, false));
        } else {
          onWhatsapp.push(new OnWhatsAppDto(result.jid, result.exists));
        }
      }
    }

    return onWhatsapp;
  }

  public async markMessageAsRead(data: ReadMessageDto) {
    this.logger.verbose('Marking message as read');
    try {
      const keys: proto.IMessageKey[] = [];
      data.readMessages.forEach((read) => {
        if (isJidGroup(read.remoteJid) || isJidUser(read.remoteJid)) {
          keys.push({
            remoteJid: read.remoteJid,
            fromMe: read.fromMe,
            id: read.id,
          });
        }
      });
      await this.client.readMessages(keys);
      return { message: 'Read messages', read: 'success' };
    } catch (error) {
      throw new InternalServerErrorException('Read messages fail', error.toString());
    }
  }

  public async archiveChat(data: ArchiveChatDto) {
    this.logger.verbose('Archiving chat');
    try {
      data.lastMessage.messageTimestamp =
        data.lastMessage?.messageTimestamp ?? Date.now();
      await this.client.chatModify(
        {
          archive: data.archive,
          lastMessages: [data.lastMessage],
        },
        data.lastMessage.key.remoteJid,
      );

      return {
        chatId: data.lastMessage.key.remoteJid,
        archived: true,
      };
    } catch (error) {
      throw new InternalServerErrorException({
        archived: false,
        message: [
          'An error occurred while archiving the chat. Open a calling.',
          error.toString(),
        ],
      });
    }
  }

  public async deleteMessage(del: DeleteMessage) {
    this.logger.verbose('Deleting message');
    try {
      return await this.client.sendMessage(del.remoteJid, { delete: del });
    } catch (error) {
      throw new InternalServerErrorException(
        'Error while deleting message for everyone',
        error?.toString(),
      );
    }
  }

  public async getBase64FromMediaMessage(data: getBase64FromMediaMessageDto) {
    this.logger.verbose('Getting base64 from media message');
    try {
      const m = data?.message;
      const convertToMp4 = data?.convertToMp4 ?? false;

      const msg = m?.message
        ? m
        : ((await this.getMessage(m.key, true)) as proto.IWebMessageInfo);

      if (!msg) {
        throw 'Message not found';
      }

      for (const subtype of MessageSubtype) {
        if (msg.message[subtype]) {
          msg.message = msg.message[subtype].message;
        }
      }

      let mediaMessage: any;
      let mediaType: string;

      for (const type of TypeMediaMessage) {
        mediaMessage = msg.message[type];
        if (mediaMessage) {
          mediaType = type;
          break;
        }
      }

      if (!mediaMessage) {
        throw 'The message is not of the media type';
      }

      if (typeof mediaMessage['mediaKey'] === 'object') {
        msg.message = JSON.parse(JSON.stringify(msg.message));
      }

      this.logger.verbose('Downloading media message');
      const buffer = await downloadMediaMessage(
        { key: msg?.key, message: msg?.message },
        'buffer',
        {},
        {
          logger: P({ level: 'error' }),
          reuploadRequest: this.client.updateMediaMessage,
        },
      );
      const typeMessage = getContentType(msg.message);

      if (convertToMp4 && typeMessage === 'audioMessage') {
        this.logger.verbose('Converting audio to mp4');
        const number = msg.key.remoteJid.split('@')[0];
        const convert = await this.processAudio(buffer.toString('base64'), number);

        if (typeof convert === 'string') {
          const audio = fs.readFileSync(convert).toString('base64');
          this.logger.verbose('Audio converted to mp4');

          const result = {
            mediaType,
            fileName: mediaMessage['fileName'],
            caption: mediaMessage['caption'],
            size: {
              fileLength: mediaMessage['fileLength'],
              height: mediaMessage['height'],
              width: mediaMessage['width'],
            },
            mimetype: 'audio/mp4',
            base64: Buffer.from(audio, 'base64').toString('base64'),
          };

          fs.unlinkSync(convert);
          this.logger.verbose('Converted audio deleted');

          this.logger.verbose('Media message downloaded');
          return result;
        }
      }

      this.logger.verbose('Media message downloaded');
      return {
        mediaType,
        fileName: mediaMessage['fileName'],
        caption: mediaMessage['caption'],
        size: {
          fileLength: mediaMessage['fileLength'],
          height: mediaMessage['height'],
          width: mediaMessage['width'],
        },
        mimetype: mediaMessage['mimetype'],
        base64: buffer.toString('base64'),
      };
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(error.toString());
    }
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

  public async fetchPrivacySettings() {
    this.logger.verbose('Fetching privacy settings');
    return await this.client.fetchPrivacySettings();
  }

  public async updatePrivacySettings(settings: PrivacySettingDto) {
    this.logger.verbose('Updating privacy settings');
    try {
      await this.client.updateReadReceiptsPrivacy(settings.privacySettings.readreceipts);
      this.logger.verbose('Read receipts privacy updated');

      await this.client.updateProfilePicturePrivacy(settings.privacySettings.profile);
      this.logger.verbose('Profile picture privacy updated');

      await this.client.updateStatusPrivacy(settings.privacySettings.status);
      this.logger.verbose('Status privacy updated');

      await this.client.updateOnlinePrivacy(settings.privacySettings.online);
      this.logger.verbose('Online privacy updated');

      await this.client.updateLastSeenPrivacy(settings.privacySettings.last);
      this.logger.verbose('Last seen privacy updated');

      await this.client.updateGroupsAddPrivacy(settings.privacySettings.groupadd);
      this.logger.verbose('Groups add privacy updated');

      // reinicia a instancia
      this.client?.ws?.close();

      return {
        update: 'success',
        data: {
          readreceipts: settings.privacySettings.readreceipts,
          profile: settings.privacySettings.profile,
          status: settings.privacySettings.status,
          online: settings.privacySettings.online,
          last: settings.privacySettings.last,
          groupadd: settings.privacySettings.groupadd,
        },
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Error updating privacy settings',
        error.toString(),
      );
    }
  }

  public async fetchBusinessProfile(number: string) {
    this.logger.verbose('Fetching business profile');
    try {
      let jid;

      if (!number) {
        jid = this.instance.wuid;
      } else {
        jid = this.createJid(number);
      }

      const profile = await this.client.getBusinessProfile(jid);
      this.logger.verbose('Trying to get business profile');

      if (!profile) {
        return {
          exists: false,
          message: 'Business profile not found',
        };
      }

      this.logger.verbose('Business profile fetched');
      return profile;
    } catch (error) {
      throw new InternalServerErrorException(
        'Error updating profile name',
        error.toString(),
      );
    }
  }

  public async updateProfileName(name: string) {
    this.logger.verbose('Updating profile name to ' + name);
    try {
      await this.client.updateProfileName(name);

      return { update: 'success' };
    } catch (error) {
      throw new InternalServerErrorException(
        'Error updating profile name',
        error.toString(),
      );
    }
  }

  public async updateProfileStatus(status: string) {
    this.logger.verbose('Updating profile status to: ' + status);
    try {
      await this.client.updateProfileStatus(status);

      return { update: 'success' };
    } catch (error) {
      throw new InternalServerErrorException(
        'Error updating profile status',
        error.toString(),
      );
    }
  }

  public async updateProfilePicture(picture: string) {
    this.logger.verbose('Updating profile picture');
    try {
      let pic: WAMediaUpload;
      if (isURL(picture)) {
        this.logger.verbose('Picture is url');

        const timestamp = new Date().getTime();
        const url = `${picture}?timestamp=${timestamp}`;
        this.logger.verbose('Including timestamp in url: ' + url);

        pic = (await axios.get(url, { responseType: 'arraybuffer' })).data;
        this.logger.verbose('Getting picture from url');
      } else if (isBase64(picture)) {
        this.logger.verbose('Picture is base64');
        pic = Buffer.from(picture, 'base64');
        this.logger.verbose('Getting picture from base64');
      } else {
        throw new BadRequestException('"profilePicture" must be a url or a base64');
      }
      await this.client.updateProfilePicture(this.instance.wuid, pic);
      this.logger.verbose('Profile picture updated');

      return { update: 'success' };
    } catch (error) {
      throw new InternalServerErrorException(
        'Error updating profile picture',
        error.toString(),
      );
    }
  }

  public async removeProfilePicture() {
    this.logger.verbose('Removing profile picture');
    try {
      await this.client.removeProfilePicture(this.instance.wuid);

      return { update: 'success' };
    } catch (error) {
      throw new InternalServerErrorException(
        'Error removing profile picture',
        error.toString(),
      );
    }
  }

  // Group
  public async createGroup(create: CreateGroupDto) {
    this.logger.verbose('Creating group: ' + create.subject);
    try {
      const participants = create.participants.map((p) => this.createJid(p));
      const { id } = await this.client.groupCreate(create.subject, participants);
      this.logger.verbose('Group created: ' + id);

      if (create?.description) {
        this.logger.verbose('Updating group description: ' + create.description);
        await this.client.groupUpdateDescription(id, create.description);
      }

      const group = await this.client.groupMetadata(id);
      this.logger.verbose('Getting group metadata');

      return { groupMetadata: group };
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException('Error creating group', error.toString());
    }
  }

  public async updateGroupPicture(picture: GroupPictureDto) {
    this.logger.verbose('Updating group picture');
    try {
      let pic: WAMediaUpload;
      if (isURL(picture.image)) {
        this.logger.verbose('Picture is url');

        const timestamp = new Date().getTime();
        const url = `${picture.image}?timestamp=${timestamp}`;
        this.logger.verbose('Including timestamp in url: ' + url);

        pic = (await axios.get(url, { responseType: 'arraybuffer' })).data;
        this.logger.verbose('Getting picture from url');
      } else if (isBase64(picture.image)) {
        this.logger.verbose('Picture is base64');
        pic = Buffer.from(picture.image, 'base64');
        this.logger.verbose('Getting picture from base64');
      } else {
        throw new BadRequestException('"profilePicture" must be a url or a base64');
      }
      await this.client.updateProfilePicture(picture.groupJid, pic);
      this.logger.verbose('Group picture updated');

      return { update: 'success' };
    } catch (error) {
      throw new InternalServerErrorException(
        'Error update group picture',
        error.toString(),
      );
    }
  }

  public async updateGroupSubject(data: GroupSubjectDto) {
    this.logger.verbose('Updating group subject to: ' + data.subject);
    try {
      await this.client.groupUpdateSubject(data.groupJid, data.subject);

      return { update: 'success' };
    } catch (error) {
      throw new InternalServerErrorException(
        'Error updating group subject',
        error.toString(),
      );
    }
  }

  public async updateGroupDescription(data: GroupDescriptionDto) {
    this.logger.verbose('Updating group description to: ' + data.description);
    try {
      await this.client.groupUpdateDescription(data.groupJid, data.description);

      return { update: 'success' };
    } catch (error) {
      throw new InternalServerErrorException(
        'Error updating group description',
        error.toString(),
      );
    }
  }

  public async findGroup(id: GroupJid, reply: 'inner' | 'out' = 'out') {
    this.logger.verbose('Fetching group');
    try {
      return await this.client.groupMetadata(id.groupJid);
    } catch (error) {
      if (reply === 'inner') {
        return;
      }
      throw new NotFoundException('Error fetching group', error.toString());
    }
  }

  public async fetchAllGroups(getParticipants: GetParticipant) {
    this.logger.verbose('Fetching all groups');
    try {
      const fetch = Object.values(await this.client.groupFetchAllParticipating());

      const groups = fetch.map((group) => {
        const result = {
          id: group.id,
          subject: group.subject,
          subjectOwner: group.subjectOwner,
          subjectTime: group.subjectTime,
          size: group.size,
          creation: group.creation,
          owner: group.owner,
          desc: group.desc,
          descId: group.descId,
          restrict: group.restrict,
          announce: group.announce,
        };

        if (getParticipants.getParticipants == 'true') {
          result['participants'] = group.participants;
        }

        return result;
      });

      return groups;
    } catch (error) {
      throw new NotFoundException('Error fetching group', error.toString());
    }
  }

  public async inviteCode(id: GroupJid) {
    this.logger.verbose('Fetching invite code for group: ' + id.groupJid);
    try {
      const code = await this.client.groupInviteCode(id.groupJid);
      return { inviteUrl: `https://chat.whatsapp.com/${code}`, inviteCode: code };
    } catch (error) {
      throw new NotFoundException('No invite code', error.toString());
    }
  }

  public async inviteInfo(id: GroupInvite) {
    this.logger.verbose('Fetching invite info for code: ' + id.inviteCode);
    try {
      return await this.client.groupGetInviteInfo(id.inviteCode);
    } catch (error) {
      throw new NotFoundException('No invite info', id.inviteCode);
    }
  }

  public async sendInvite(id: GroupSendInvite) {
    this.logger.verbose('Sending invite for group: ' + id.groupJid);
    try {
      const inviteCode = await this.inviteCode({ groupJid: id.groupJid });
      this.logger.verbose('Getting invite code: ' + inviteCode.inviteCode);

      const inviteUrl = inviteCode.inviteUrl;
      this.logger.verbose('Invite url: ' + inviteUrl);

      const numbers = id.numbers.map((number) => this.createJid(number));
      const description = id.description ?? '';

      const msg = `${description}\n\n${inviteUrl}`;

      const message = {
        conversation: msg,
      };

      for await (const number of numbers) {
        await this.sendMessageWithTyping(number, message);
      }

      this.logger.verbose('Invite sent for numbers: ' + numbers.join(', '));

      return { send: true, inviteUrl };
    } catch (error) {
      throw new NotFoundException('No send invite');
    }
  }

  public async revokeInviteCode(id: GroupJid) {
    this.logger.verbose('Revoking invite code for group: ' + id.groupJid);
    try {
      const inviteCode = await this.client.groupRevokeInvite(id.groupJid);
      return { revoked: true, inviteCode };
    } catch (error) {
      throw new NotFoundException('Revoke error', error.toString());
    }
  }

  public async findParticipants(id: GroupJid) {
    this.logger.verbose('Fetching participants for group: ' + id.groupJid);
    try {
      const participants = (await this.client.groupMetadata(id.groupJid)).participants;
      return { participants };
    } catch (error) {
      throw new NotFoundException('No participants', error.toString());
    }
  }

  public async updateGParticipant(update: GroupUpdateParticipantDto) {
    this.logger.verbose('Updating participants');
    try {
      const participants = update.participants.map((p) => this.createJid(p));
      const updateParticipants = await this.client.groupParticipantsUpdate(
        update.groupJid,
        participants,
        update.action,
      );
      return { updateParticipants: updateParticipants };
    } catch (error) {
      throw new BadRequestException('Error updating participants', error.toString());
    }
  }

  public async updateGSetting(update: GroupUpdateSettingDto) {
    this.logger.verbose('Updating setting for group: ' + update.groupJid);
    try {
      const updateSetting = await this.client.groupSettingUpdate(
        update.groupJid,
        update.action,
      );
      return { updateSetting: updateSetting };
    } catch (error) {
      throw new BadRequestException('Error updating setting', error.toString());
    }
  }

  public async toggleEphemeral(update: GroupToggleEphemeralDto) {
    this.logger.verbose('Toggling ephemeral for group: ' + update.groupJid);
    try {
      const toggleEphemeral = await this.client.groupToggleEphemeral(
        update.groupJid,
        update.expiration,
      );
      return { success: true };
    } catch (error) {
      throw new BadRequestException('Error updating setting', error.toString());
    }
  }

  public async leaveGroup(id: GroupJid) {
    this.logger.verbose('Leaving group: ' + id.groupJid);
    try {
      await this.client.groupLeave(id.groupJid);
      return { groupJid: id.groupJid, leave: true };
    } catch (error) {
      throw new BadRequestException('Unable to leave the group', error.toString());
    }
  }
}
