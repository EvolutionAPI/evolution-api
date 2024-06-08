import { WASocket } from '@whiskeysockets/baileys';
import axios from 'axios';
import { execSync } from 'child_process';
import { isURL } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import { join } from 'path';
import { v4 } from 'uuid';

import {
  Auth,
  Chatwoot,
  CleanStoreConf,
  ConfigService,
  Database,
  HttpServer,
  Log,
  Rabbitmq,
  Sqs,
  Typebot,
  Webhook,
  Websocket,
} from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { ROOT_DIR } from '../../config/path.config';
import { NotFoundException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
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
  ) {}

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
  public readonly localSettings: wa.LocalSettings = {};
  public readonly storePath = join(ROOT_DIR, 'store');

  public chatwootService = new ChatwootService(
    waMonitor,
    this.configService,
    this.prismaRepository,
    this.chatwootCache,
  );

  public typebotService = new TypebotService(waMonitor, this.configService, this.prismaRepository, this.eventEmitter);

  public setInstance(instance: InstanceDto) {
    this.instance.name = instance.instanceName;
    this.instance.id = instance.instanceId;
    this.instance.integration = instance.integration;
    this.instance.number = instance.number;
    this.instance.token = instance.token;

    this.sendDataWebhook(Events.STATUS_INSTANCE, {
      instance: this.instance.name,
      status: 'created',
    });

    if (this.configService.get<Chatwoot>('CHATWOOT').ENABLED && this.localChatwoot.enabled) {
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

  public set instanceName(name: string) {
    this.logger.setInstance(name);

    if (!name) {
      this.instance.name = v4();
      return;
    }
    this.instance.name = name;
  }

  public get instanceName() {
    return this.instance.name;
  }

  public set instanceId(id: string) {
    if (!id) {
      this.instance.id = v4();
      return;
    }
    this.instance.id = id;
  }

  public get instanceId() {
    return this.instance.id;
  }

  public set integration(integration: string) {
    this.instance.integration = integration;
  }

  public get integration() {
    return this.instance.integration;
  }

  public set number(number: string) {
    this.instance.number = number;
  }

  public get number() {
    return this.instance.number;
  }

  public set token(token: string) {
    this.instance.token = token;
  }

  public get token() {
    return this.instance.token;
  }

  public get wuid() {
    return this.instance.wuid;
  }

  public async loadSettings() {
    const data = await this.prismaRepository.setting.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localSettings.rejectCall = data?.rejectCall;
    this.localSettings.msgCall = data?.msgCall;
    this.localSettings.groupsIgnore = data?.groupsIgnore;
    this.localSettings.alwaysOnline = data?.alwaysOnline;
    this.localSettings.readMessages = data?.readMessages;
    this.localSettings.readStatus = data?.readStatus;
    this.localSettings.syncFullHistory = data?.syncFullHistory;
  }

  public async setSettings(data: SettingsDto) {
    await this.prismaRepository.setting.upsert({
      where: {
        instanceId: this.instanceId,
      },
      update: {
        rejectCall: data.rejectCall,
        msgCall: data.msgCall,
        groupsIgnore: data.groupsIgnore,
        alwaysOnline: data.alwaysOnline,
        readMessages: data.readMessages,
        readStatus: data.readStatus,
        syncFullHistory: data.syncFullHistory,
      },
      create: {
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

    Object.assign(this.localSettings, data);
  }

  public async findSettings() {
    const data = await this.prismaRepository.setting.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      return null;
    }

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
    const data = await this.prismaRepository.webhook.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localWebhook.url = data?.url;
    this.localWebhook.enabled = data?.enabled;
    this.localWebhook.events = data?.events;
    this.localWebhook.webhookByEvents = data?.webhookByEvents;
    this.localWebhook.webhookBase64 = data?.webhookBase64;
  }

  public async setWebhook(data: WebhookDto) {
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

    Object.assign(this.localWebhook, data);
  }

  public async findWebhook() {
    const data = await this.prismaRepository.webhook.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      throw new NotFoundException('Webhook not found');
    }

    return data;
  }

  public async loadChatwoot() {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
      return;
    }

    const data = await this.prismaRepository.chatwoot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localChatwoot.enabled = data?.enabled;
    this.localChatwoot.accountId = data?.accountId;
    this.localChatwoot.token = data?.token;
    this.localChatwoot.url = data?.url;
    this.localChatwoot.nameInbox = data?.nameInbox;
    this.localChatwoot.signMsg = data?.signMsg;
    this.localChatwoot.signDelimiter = data?.signDelimiter;
    this.localChatwoot.number = data?.number;
    this.localChatwoot.reopenConversation = data?.reopenConversation;
    this.localChatwoot.conversationPending = data?.conversationPending;
    this.localChatwoot.mergeBrazilContacts = data?.mergeBrazilContacts;
    this.localChatwoot.importContacts = data?.importContacts;
    this.localChatwoot.importMessages = data?.importMessages;
    this.localChatwoot.daysLimitImportMessages = data?.daysLimitImportMessages;
  }

  public async setChatwoot(data: ChatwootDto) {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
      return;
    }

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

    Object.assign(this.localChatwoot, { ...data, signDelimiter: data.signMsg ? data.signDelimiter : null });

    this.clearCacheChatwoot();
  }

  public async findChatwoot() {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
      return null;
    }

    const data = await this.prismaRepository.chatwoot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      return null;
    }

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
    if (this.localChatwoot.enabled) {
      this.chatwootService.getCache()?.deleteAll(this.instanceName);
    }
  }

  public async loadWebsocket() {
    const data = await this.prismaRepository.websocket.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localWebsocket.enabled = data?.enabled;
    this.localWebsocket.events = data?.events;
  }

  public async setWebsocket(data: WebsocketDto) {
    await this.prismaRepository.websocket.create({
      data: {
        enabled: data.enabled,
        events: data.events,
        instanceId: this.instanceId,
      },
    });

    Object.assign(this.localWebsocket, data);
  }

  public async findWebsocket() {
    const data = await this.prismaRepository.websocket.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      throw new NotFoundException('Websocket not found');
    }

    return data;
  }

  public async loadRabbitmq() {
    const data = await this.prismaRepository.rabbitmq.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localRabbitmq.enabled = data?.enabled;
    this.localRabbitmq.events = data?.events;
  }

  public async setRabbitmq(data: RabbitmqDto) {
    await this.prismaRepository.rabbitmq.create({
      data: {
        enabled: data.enabled,
        events: data.events,
        instanceId: this.instanceId,
      },
    });

    Object.assign(this.localRabbitmq, data);
  }

  public async findRabbitmq() {
    const data = await this.prismaRepository.rabbitmq.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      throw new NotFoundException('Rabbitmq not found');
    }

    return data;
  }

  public async removeRabbitmqQueues() {
    if (this.localRabbitmq.enabled) {
      removeQueues(this.instanceName, this.localRabbitmq.events);
    }
  }

  public async loadSqs() {
    const data = await this.prismaRepository.sqs.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localSqs.enabled = data?.enabled;
    this.localSqs.events = data?.events;
  }

  public async setSqs(data: SqsDto) {
    await this.prismaRepository.sqs.create({
      data: {
        enabled: data.enabled,
        events: data.events,
        instanceId: this.instanceId,
      },
    });

    Object.assign(this.localSqs, data);
  }

  public async findSqs() {
    const data = await this.prismaRepository.sqs.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      throw new NotFoundException('Sqs not found');
    }

    return data;
  }

  public async removeSqsQueues() {
    if (this.localSqs.enabled) {
      removeQueuesSQS(this.instanceName, this.localSqs.events);
    }
  }

  public async loadTypebot() {
    if (!this.configService.get<Typebot>('TYPEBOT').ENABLED) {
      return;
    }
    const data = await this.prismaRepository.typebot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
      include: {
        sessions: true,
      },
    });

    this.localTypebot.enabled = data?.enabled;
    this.localTypebot.url = data?.url;
    this.localTypebot.typebot = data?.typebot;
    this.localTypebot.expire = data?.expire;
    this.localTypebot.keywordFinish = data?.keywordFinish;
    this.localTypebot.delayMessage = data?.delayMessage;
    this.localTypebot.unknownMessage = data?.unknownMessage;
    this.localTypebot.listeningFromMe = data?.listeningFromMe;
    this.localTypebot.sessions = data?.sessions;
  }

  public async setTypebot(data: TypebotDto) {
    if (!this.configService.get<Typebot>('TYPEBOT').ENABLED) {
      return;
    }

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

    Object.assign(this.localTypebot, data);
  }

  public async findTypebot() {
    if (!this.configService.get<Typebot>('TYPEBOT').ENABLED) {
      return;
    }
    const data = await this.prismaRepository.typebot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
      include: {
        sessions: true,
      },
    });

    if (!data) {
      throw new NotFoundException('Typebot not found');
    }

    return data;
  }

  public async loadProxy() {
    const data = await this.prismaRepository.proxy.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localProxy.enabled = data?.enabled;
    this.localProxy.host = data?.host;
    this.localProxy.port = data?.port;
    this.localProxy.protocol = data?.protocol;
    this.localProxy.username = data?.username;
    this.localProxy.password = data?.password;
  }

  public async setProxy(data: ProxyDto) {
    await this.prismaRepository.proxy.create({
      data: {
        enabled: data.enabled,
        host: data.host,
        port: data.port,
        protocol: data.protocol,
        username: data.username,
        password: data.password,
        instanceId: this.instanceId,
      },
    });

    Object.assign(this.localProxy, data);
  }

  public async findProxy() {
    const data = await this.prismaRepository.proxy.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
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

    const instanceApikey = this.token || 'Apikey not found';

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
    const cleanStore = this.configService.get<CleanStoreConf>('CLEAN_STORE');
    const database = this.configService.get<Database>('DATABASE');
    if (cleanStore?.CLEANING_INTERVAL && !database.ENABLED) {
      setInterval(() => {
        try {
          for (const [key, value] of Object.entries(cleanStore)) {
            if (value === true) {
              execSync(
                `rm -rf ${join(this.storePath, key.toLowerCase().replace('_', '-'), this.instance.name)}/*.json`,
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
    if (number.includes('@g.us') || number.includes('@s.whatsapp.net') || number.includes('@lid')) {
      return number;
    }

    if (number.includes('@broadcast')) {
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
      number = number.replace(/[^\d-]/g, '');
      return `${number}@g.us`;
    }

    number = number.replace(/\D/g, '');

    if (number.length >= 18) {
      number = number.replace(/[^\d-]/g, '');
      return `${number}@g.us`;
    }

    number = this.formatMXOrARNumber(number);

    number = this.formatBRNumber(number);

    return `${number}@s.whatsapp.net`;
  }

  public async fetchContacts(query: any) {
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
    return await this.prismaRepository.chat.findMany({ where: { instanceId: this.instanceId } });
  }
}
