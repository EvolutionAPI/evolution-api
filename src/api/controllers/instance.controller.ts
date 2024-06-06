import { JsonValue } from '@prisma/client/runtime/library';
import { delay } from '@whiskeysockets/baileys';
import { isURL } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import { v4 } from 'uuid';

import { Auth, ConfigService, HttpServer, WaBusiness } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { BadRequestException, InternalServerErrorException, UnauthorizedException } from '../../exceptions';
import { InstanceDto, SetPresenceDto } from '../dto/instance.dto';
import { ChatwootService } from '../integrations/chatwoot/services/chatwoot.service';
import { RabbitmqService } from '../integrations/rabbitmq/services/rabbitmq.service';
import { SqsService } from '../integrations/sqs/services/sqs.service';
import { TypebotService } from '../integrations/typebot/services/typebot.service';
import { WebsocketService } from '../integrations/websocket/services/websocket.service';
import { ProviderFiles } from '../provider/sessions';
import { PrismaRepository } from '../repository/repository.service';
import { AuthService } from '../services/auth.service';
import { CacheService } from '../services/cache.service';
import { BaileysStartupService } from '../services/channels/whatsapp.baileys.service';
import { BusinessStartupService } from '../services/channels/whatsapp.business.service';
import { IntegrationService } from '../services/integration.service';
import { WAMonitoringService } from '../services/monitor.service';
import { SettingsService } from '../services/settings.service';
import { WebhookService } from '../services/webhook.service';
import { Events, Integration, wa } from '../types/wa.types';
import { ProxyController } from './proxy.controller';

export class InstanceController {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly authService: AuthService,
    private readonly webhookService: WebhookService,
    private readonly chatwootService: ChatwootService,
    private readonly settingsService: SettingsService,
    private readonly websocketService: WebsocketService,
    private readonly rabbitmqService: RabbitmqService,
    private readonly sqsService: SqsService,
    private readonly typebotService: TypebotService,
    private readonly integrationService: IntegrationService,
    private readonly proxyService: ProxyController,
    private readonly cache: CacheService,
    private readonly chatwootCache: CacheService,
    private readonly baileysCache: CacheService,
    private readonly providerFiles: ProviderFiles,
  ) {}

  private readonly logger = new Logger(InstanceController.name);

  public async createInstance({
    instanceName,
    webhook,
    webhookByEvents,
    webhookBase64,
    webhookEvents,
    qrcode,
    number,
    integration,
    token,
    chatwootAccountId,
    chatwootToken,
    chatwootUrl,
    chatwootSignMsg,
    chatwootReopenConversation,
    chatwootConversationPending,
    chatwootImportContacts,
    chatwootNameInbox,
    chatwootMergeBrazilContacts,
    chatwootImportMessages,
    chatwootDaysLimitImportMessages,
    rejectCall,
    msgCall,
    groupsIgnore,
    alwaysOnline,
    readMessages,
    readStatus,
    syncFullHistory,
    websocketEnabled,
    websocketEvents,
    rabbitmqEnabled,
    rabbitmqEvents,
    sqsEnabled,
    sqsEvents,
    typebotUrl,
    typebot,
    typebotExpire,
    typebotKeywordFinish,
    typebotDelayMessage,
    typebotUnknownMessage,
    typebotListeningFromMe,
    proxy,
  }: InstanceDto) {
    try {
      this.logger.verbose('requested createInstance from ' + instanceName + ' instance');

      this.logger.verbose('checking duplicate token');
      await this.authService.checkDuplicateToken(token);

      if (!token && integration === Integration.WHATSAPP_BUSINESS) {
        throw new BadRequestException('token is required');
      }

      this.logger.verbose('creating instance');
      let instance: BaileysStartupService | BusinessStartupService;
      if (integration === Integration.WHATSAPP_BUSINESS) {
        instance = new BusinessStartupService(
          this.configService,
          this.eventEmitter,
          this.prismaRepository,
          this.cache,
          this.chatwootCache,
          this.baileysCache,
          this.providerFiles,
        );
      } else {
        instance = new BaileysStartupService(
          this.configService,
          this.eventEmitter,
          this.prismaRepository,
          this.cache,
          this.chatwootCache,
          this.baileysCache,
          this.providerFiles,
        );
      }

      const instanceId = v4();

      await this.waMonitor.saveInstance({ instanceId, integration, instanceName, token, number });

      instance.instanceName = instanceName;
      instance.instanceId = instanceId;

      instance.sendDataWebhook(Events.INSTANCE_CREATE, {
        instanceName,
        instanceId: instanceId,
      });

      this.logger.verbose('instance: ' + instance.instanceName + ' created');

      this.waMonitor.waInstances[instance.instanceName] = instance;
      this.waMonitor.delInstanceTime(instance.instanceName);

      this.logger.verbose('generating hash');
      const hash = await this.authService.generateHash(
        {
          instanceName: instance.instanceName,
          instanceId: instanceId,
        },
        token,
      );

      this.logger.verbose('hash: ' + hash + ' generated');

      let getWebhookEvents: string[];

      if (webhook) {
        if (!isURL(webhook, { require_tld: false })) {
          throw new BadRequestException('Invalid "url" property in webhook');
        }

        this.logger.verbose('creating webhook');
        try {
          let newEvents: string[] = [];
          if (webhookEvents.length === 0) {
            newEvents = [
              'APPLICATION_STARTUP',
              'QRCODE_UPDATED',
              'MESSAGES_SET',
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'MESSAGES_DELETE',
              'SEND_MESSAGE',
              'CONTACTS_SET',
              'CONTACTS_UPSERT',
              'CONTACTS_UPDATE',
              'PRESENCE_UPDATE',
              'CHATS_SET',
              'CHATS_UPSERT',
              'CHATS_UPDATE',
              'CHATS_DELETE',
              'GROUPS_UPSERT',
              'GROUP_UPDATE',
              'GROUP_PARTICIPANTS_UPDATE',
              'CONNECTION_UPDATE',
              'LABELS_EDIT',
              'LABELS_ASSOCIATION',
              'CALL',
              'TYPEBOT_START',
              'TYPEBOT_CHANGE_STATUS',
            ];
          } else {
            newEvents = webhookEvents;
          }
          this.webhookService.create(instance, {
            enabled: true,
            url: webhook,
            events: newEvents,
            webhookByEvents,
            webhookBase64,
          });

          const webhookEventsJson: JsonValue = (await this.webhookService.find(instance)).events;

          getWebhookEvents = Array.isArray(webhookEventsJson) ? webhookEventsJson.map((event) => String(event)) : [];
        } catch (error) {
          this.logger.log(error);
        }
      }

      let getWebsocketEvents: string[];

      if (websocketEnabled) {
        this.logger.verbose('creating websocket');
        try {
          let newEvents: string[] = [];
          if (websocketEvents.length === 0) {
            newEvents = [
              'APPLICATION_STARTUP',
              'QRCODE_UPDATED',
              'MESSAGES_SET',
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'MESSAGES_DELETE',
              'SEND_MESSAGE',
              'CONTACTS_SET',
              'CONTACTS_UPSERT',
              'CONTACTS_UPDATE',
              'PRESENCE_UPDATE',
              'CHATS_SET',
              'CHATS_UPSERT',
              'CHATS_UPDATE',
              'CHATS_DELETE',
              'GROUPS_UPSERT',
              'GROUP_UPDATE',
              'GROUP_PARTICIPANTS_UPDATE',
              'CONNECTION_UPDATE',
              'LABELS_EDIT',
              'LABELS_ASSOCIATION',
              'CALL',
              'TYPEBOT_START',
              'TYPEBOT_CHANGE_STATUS',
            ];
          } else {
            newEvents = websocketEvents;
          }
          this.websocketService.create(instance, {
            enabled: true,
            events: newEvents,
          });

          const websocketEventsJson: JsonValue = (await this.websocketService.find(instance)).events;

          // websocketEvents = (await this.websocketService.find(instance)).events;
          getWebsocketEvents = Array.isArray(websocketEventsJson)
            ? websocketEventsJson.map((event) => String(event))
            : [];
        } catch (error) {
          this.logger.log(error);
        }
      }

      let getRabbitmqEvents: string[];

      if (rabbitmqEnabled) {
        this.logger.verbose('creating rabbitmq');
        try {
          let newEvents: string[] = [];
          if (rabbitmqEvents.length === 0) {
            newEvents = [
              'APPLICATION_STARTUP',
              'QRCODE_UPDATED',
              'MESSAGES_SET',
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'MESSAGES_DELETE',
              'SEND_MESSAGE',
              'CONTACTS_SET',
              'CONTACTS_UPSERT',
              'CONTACTS_UPDATE',
              'PRESENCE_UPDATE',
              'CHATS_SET',
              'CHATS_UPSERT',
              'CHATS_UPDATE',
              'CHATS_DELETE',
              'GROUPS_UPSERT',
              'GROUP_UPDATE',
              'GROUP_PARTICIPANTS_UPDATE',
              'CONNECTION_UPDATE',
              'LABELS_EDIT',
              'LABELS_ASSOCIATION',
              'CALL',
              'TYPEBOT_START',
              'TYPEBOT_CHANGE_STATUS',
            ];
          } else {
            newEvents = rabbitmqEvents;
          }
          this.rabbitmqService.create(instance, {
            enabled: true,
            events: newEvents,
          });

          const rabbitmqEventsJson: JsonValue = (await this.rabbitmqService.find(instance)).events;

          getRabbitmqEvents = Array.isArray(rabbitmqEventsJson) ? rabbitmqEventsJson.map((event) => String(event)) : [];

          // rabbitmqEvents = (await this.rabbitmqService.find(instance)).events;
        } catch (error) {
          this.logger.log(error);
        }
      }

      let getSqsEvents: string[];

      if (sqsEnabled) {
        this.logger.verbose('creating sqs');
        try {
          let newEvents: string[] = [];
          if (sqsEvents.length === 0) {
            newEvents = [
              'APPLICATION_STARTUP',
              'QRCODE_UPDATED',
              'MESSAGES_SET',
              'MESSAGES_UPSERT',
              'MESSAGES_UPDATE',
              'MESSAGES_DELETE',
              'SEND_MESSAGE',
              'CONTACTS_SET',
              'CONTACTS_UPSERT',
              'CONTACTS_UPDATE',
              'PRESENCE_UPDATE',
              'CHATS_SET',
              'CHATS_UPSERT',
              'CHATS_UPDATE',
              'CHATS_DELETE',
              'GROUPS_UPSERT',
              'GROUP_UPDATE',
              'GROUP_PARTICIPANTS_UPDATE',
              'CONNECTION_UPDATE',
              'LABELS_EDIT',
              'LABELS_ASSOCIATION',
              'CALL',
              'TYPEBOT_START',
              'TYPEBOT_CHANGE_STATUS',
            ];
          } else {
            newEvents = sqsEvents;
          }
          this.sqsService.create(instance, {
            enabled: true,
            events: newEvents,
          });

          const sqsEventsJson: JsonValue = (await this.sqsService.find(instance)).events;

          getSqsEvents = Array.isArray(sqsEventsJson) ? sqsEventsJson.map((event) => String(event)) : [];

          // sqsEvents = (await this.sqsService.find(instance)).events;
        } catch (error) {
          this.logger.log(error);
        }
      }

      if (proxy) {
        const testProxy = await this.proxyService.testProxy(proxy);
        if (!testProxy) {
          throw new BadRequestException('Invalid proxy');
        }

        await this.proxyService.createProxy(instance, {
          enabled: true,
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol,
          username: proxy.username,
          password: proxy.password,
        });
      }

      if (typebotUrl) {
        try {
          if (!isURL(typebotUrl, { require_tld: false })) {
            throw new BadRequestException('Invalid "url" property in typebotUrl');
          }

          this.logger.verbose('creating typebot');

          this.typebotService.create(instance, {
            enabled: true,
            url: typebotUrl,
            typebot: typebot,
            expire: typebotExpire,
            keywordFinish: typebotKeywordFinish,
            delayMessage: typebotDelayMessage,
            unknownMessage: typebotUnknownMessage,
            listeningFromMe: typebotListeningFromMe,
          });
        } catch (error) {
          this.logger.log(error);
        }
      }

      this.logger.verbose('creating settings');
      const settings: wa.LocalSettings = {
        rejectCall: rejectCall || false,
        msgCall: msgCall || '',
        groupsIgnore: groupsIgnore || true,
        alwaysOnline: alwaysOnline || false,
        readMessages: readMessages || false,
        readStatus: readStatus || false,
        syncFullHistory: syncFullHistory ?? false,
      };

      this.logger.verbose('settings: ' + JSON.stringify(settings));

      this.settingsService.create(instance, settings);

      let webhookWaBusiness = null,
        accessTokenWaBusiness = '';

      if (integration === Integration.WHATSAPP_BUSINESS) {
        if (!number) {
          throw new BadRequestException('number is required');
        }
        const urlServer = this.configService.get<HttpServer>('SERVER').URL;
        webhookWaBusiness = `${urlServer}/webhook/whatsapp/${encodeURIComponent(instance.instanceName)}`;
        accessTokenWaBusiness = this.configService.get<WaBusiness>('WA_BUSINESS').TOKEN_WEBHOOK;
      }

      this.integrationService.create(instance, {
        integration,
        number,
        token,
      });
      if (!chatwootAccountId || !chatwootToken || !chatwootUrl) {
        let getQrcode: wa.QrCode;

        if (qrcode) {
          this.logger.verbose('creating qrcode');
          await instance.connectToWhatsapp(number);
          await delay(5000);
          getQrcode = instance.qrCode;
        }

        const result = {
          instance: {
            instanceName: instance.instanceName,
            instanceId: instanceId,
            integration: integration,
            webhookWaBusiness,
            accessTokenWaBusiness,
            status: 'created',
          },
          hash,
          webhook: {
            webhook,
            webhookByEvents,
            webhookBase64,
            events: getWebhookEvents,
          },
          websocket: {
            enabled: websocketEnabled,
            events: getWebsocketEvents,
          },
          rabbitmq: {
            enabled: rabbitmqEnabled,
            events: getRabbitmqEvents,
          },
          sqs: {
            enabled: sqsEnabled,
            events: getSqsEvents,
          },
          typebot: {
            enabled: typebotUrl ? true : false,
            url: typebotUrl,
            typebot,
            expire: typebotExpire,
            keywordFinish: typebotKeywordFinish,
            delayMessage: typebotDelayMessage,
            unknownMessage: typebotUnknownMessage,
            listeningFromMe: typebotListeningFromMe,
          },
          settings,
          qrcode: getQrcode,
        };

        this.logger.verbose('instance created');
        this.logger.verbose(result);

        return result;
      }

      if (!chatwootAccountId) {
        throw new BadRequestException('accountId is required');
      }

      if (!chatwootToken) {
        throw new BadRequestException('token is required');
      }

      if (!chatwootUrl) {
        throw new BadRequestException('url is required');
      }

      if (!isURL(chatwootUrl, { require_tld: false })) {
        throw new BadRequestException('Invalid "url" property in chatwoot');
      }

      if (chatwootSignMsg !== true && chatwootSignMsg !== false) {
        throw new BadRequestException('signMsg is required');
      }

      if (chatwootReopenConversation !== true && chatwootReopenConversation !== false) {
        throw new BadRequestException('reopenConversation is required');
      }

      if (chatwootConversationPending !== true && chatwootConversationPending !== false) {
        throw new BadRequestException('conversationPending is required');
      }

      const urlServer = this.configService.get<HttpServer>('SERVER').URL;

      try {
        this.chatwootService.create(instance, {
          enabled: true,
          accountId: chatwootAccountId,
          token: chatwootToken,
          url: chatwootUrl,
          signMsg: chatwootSignMsg || false,
          nameInbox: chatwootNameInbox ?? instance.instanceName.split('-cwId-')[0],
          number,
          reopenConversation: chatwootReopenConversation || false,
          conversationPending: chatwootConversationPending || false,
          importContacts: chatwootImportContacts ?? true,
          mergeBrazilContacts: chatwootMergeBrazilContacts ?? false,
          importMessages: chatwootImportMessages ?? true,
          daysLimitImportMessages: chatwootDaysLimitImportMessages ?? 60,
          autoCreate: true,
        });
      } catch (error) {
        this.logger.log(error);
      }

      return {
        instance: {
          instanceName: instance.instanceName,
          instanceId: instanceId,
          integration: integration,
          webhookWaBusiness,
          accessTokenWaBusiness,
          status: 'created',
        },
        hash,
        webhook: {
          webhook,
          webhookByEvents,
          webhookBase64,
          events: getWebhookEvents,
        },
        websocket: {
          enabled: websocketEnabled,
          events: getWebsocketEvents,
        },
        rabbitmq: {
          enabled: rabbitmqEnabled,
          events: getRabbitmqEvents,
        },
        sqs: {
          enabled: sqsEnabled,
          events: getSqsEvents,
        },
        typebot: {
          enabled: typebotUrl ? true : false,
          url: typebotUrl,
          typebot,
          expire: typebotExpire,
          keywordFinish: typebotKeywordFinish,
          delayMessage: typebotDelayMessage,
          unknownMessage: typebotUnknownMessage,
          listeningFromMe: typebotListeningFromMe,
        },
        settings,
        chatwoot: {
          enabled: true,
          accountId: chatwootAccountId,
          token: chatwootToken,
          url: chatwootUrl,
          signMsg: chatwootSignMsg || false,
          reopenConversation: chatwootReopenConversation || false,
          conversationPending: chatwootConversationPending || false,
          mergeBrazilContacts: chatwootMergeBrazilContacts ?? false,
          importContacts: chatwootImportContacts ?? true,
          importMessages: chatwootImportMessages ?? true,
          daysLimitImportMessages: chatwootDaysLimitImportMessages || 60,
          number,
          nameInbox: chatwootNameInbox ?? instance.instanceName,
          webhookUrl: `${urlServer}/chatwoot/webhook/${encodeURIComponent(instance.instanceName)}`,
        },
      };
    } catch (error) {
      this.logger.error(error.message[0]);
      throw new BadRequestException(error.message[0]);
    }
  }

  public async connectToWhatsapp({ instanceName, number = null }: InstanceDto) {
    try {
      this.logger.verbose('requested connectToWhatsapp from ' + instanceName + ' instance');

      const instance = this.waMonitor.waInstances[instanceName];
      const state = instance?.connectionStatus?.state;

      this.logger.verbose('state: ' + state);

      if (!state) {
        throw new BadRequestException('The "' + instanceName + '" instance does not exist');
      }

      if (state == 'open') {
        return await this.connectionState({ instanceName });
      }

      if (state == 'connecting') {
        return instance.qrCode;
      }

      if (state == 'close') {
        this.logger.verbose('connecting');
        await instance.connectToWhatsapp(number);

        await delay(5000);
        return instance.qrCode;
      }

      return {
        instance: {
          instanceName: instanceName,
          status: state,
        },
        qrcode: instance?.qrCode,
      };
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async restartInstance({ instanceName }: InstanceDto) {
    try {
      this.logger.verbose('requested restartInstance from ' + instanceName + ' instance');

      const instance = this.waMonitor.waInstances[instanceName];
      const state = instance?.connectionStatus?.state;

      switch (state) {
        case 'open':
          this.logger.verbose('logging out instance: ' + instanceName);
          instance.clearCacheChatwoot();
          await instance.reloadConnection();
          await delay(2000);

          return await this.connectionState({ instanceName });
        default:
          return await this.connectionState({ instanceName });
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async connectionState({ instanceName }: InstanceDto) {
    this.logger.verbose('requested connectionState from ' + instanceName + ' instance');
    return {
      instance: {
        instanceName: instanceName,
        state: this.waMonitor.waInstances[instanceName]?.connectionStatus?.state,
      },
    };
  }

  public async fetchInstances({ instanceName, instanceId, number }: InstanceDto, key: string) {
    const env = this.configService.get<Auth>('AUTHENTICATION').API_KEY;

    let name = instanceName;
    let arrayReturn = false;

    if (env.KEY !== key) {
      const instanceByKey = await this.prismaRepository.auth.findUnique({
        where: {
          apikey: key,
        },
        include: {
          Instance: true,
        },
      });

      if (instanceByKey) {
        name = instanceByKey.Instance.name;
        arrayReturn = true;
      } else {
        throw new UnauthorizedException();
      }
    }

    if (name) {
      this.logger.verbose('requested fetchInstances from ' + name + ' instance');
      this.logger.verbose('instanceName: ' + name);
      return this.waMonitor.instanceInfo(name, arrayReturn);
    } else if (instanceId || number) {
      return this.waMonitor.instanceInfoById(instanceId, number);
    }

    this.logger.verbose('requested fetchInstances (all instances)');
    return this.waMonitor.instanceInfo();
  }

  public async setPresence({ instanceName }: InstanceDto, data: SetPresenceDto) {
    this.logger.verbose('requested sendPresence from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].setPresence(data);
  }

  public async logout({ instanceName }: InstanceDto) {
    this.logger.verbose('requested logout from ' + instanceName + ' instance');
    const { instance } = await this.connectionState({ instanceName });

    if (instance.state === 'close') {
      throw new BadRequestException('The "' + instanceName + '" instance is not connected');
    }

    try {
      this.waMonitor.waInstances[instanceName]?.logoutInstance();

      return { status: 'SUCCESS', error: false, response: { message: 'Instance logged out' } };
    } catch (error) {
      throw new InternalServerErrorException(error.toString());
    }
  }

  public async deleteInstance({ instanceName }: InstanceDto) {
    this.logger.verbose('requested deleteInstance from ' + instanceName + ' instance');
    const { instance } = await this.connectionState({ instanceName });

    if (instance.state === 'open') {
      throw new BadRequestException('The "' + instanceName + '" instance needs to be disconnected');
    }
    try {
      const waInstances = this.waMonitor.waInstances[instanceName];
      waInstances?.removeRabbitmqQueues();
      waInstances?.clearCacheChatwoot();

      if (instance.state === 'connecting') {
        this.logger.verbose('logging out instance: ' + instanceName);

        await this.logout({ instanceName });
      }

      this.logger.verbose('deleting instance: ' + instanceName);

      try {
        waInstances?.sendDataWebhook(Events.INSTANCE_DELETE, {
          instanceName,
          instanceId: waInstances.instanceId,
        });
      } catch (error) {
        this.logger.error(error);
      }

      delete this.waMonitor.waInstances[instanceName];
      this.eventEmitter.emit('remove.instance', instanceName, 'inner');
      return { status: 'SUCCESS', error: false, response: { message: 'Instance deleted' } };
    } catch (error) {
      throw new BadRequestException(error.toString());
    }
  }
}
