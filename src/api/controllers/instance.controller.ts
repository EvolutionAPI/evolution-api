import { JsonValue } from '@prisma/client/runtime/library';
import { delay } from 'baileys';
import { isArray, isURL } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import { v4 } from 'uuid';

import { Auth, Chatwoot, ConfigService, HttpServer, WaBusiness } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { BadRequestException, InternalServerErrorException, UnauthorizedException } from '../../exceptions';
import { InstanceDto, SetPresenceDto } from '../dto/instance.dto';
import { ChatwootService } from '../integrations/chatwoot/services/chatwoot.service';
import { RabbitmqService } from '../integrations/rabbitmq/services/rabbitmq.service';
import { SqsService } from '../integrations/sqs/services/sqs.service';
import { WebsocketService } from '../integrations/websocket/services/websocket.service';
import { ProviderFiles } from '../provider/sessions';
import { PrismaRepository } from '../repository/repository.service';
import { AuthService } from '../services/auth.service';
import { CacheService } from '../services/cache.service';
import { BaileysStartupService } from '../services/channels/whatsapp.baileys.service';
import { BusinessStartupService } from '../services/channels/whatsapp.business.service';
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
    private readonly proxyService: ProxyController,
    private readonly cache: CacheService,
    private readonly chatwootCache: CacheService,
    private readonly baileysCache: CacheService,
    private readonly providerFiles: ProviderFiles,
  ) {}

  private readonly logger = new Logger(InstanceController.name);

  public async createInstance({
    instanceName,
    qrcode,
    number,
    integration,
    token,
    rejectCall,
    msgCall,
    groupsIgnore,
    alwaysOnline,
    readMessages,
    readStatus,
    syncFullHistory,
    proxyHost,
    proxyPort,
    proxyProtocol,
    proxyUsername,
    proxyPassword,
    webhookUrl,
    webhookByEvents,
    webhookBase64,
    webhookEvents,
    websocketEnabled,
    websocketEvents,
    rabbitmqEnabled,
    rabbitmqEvents,
    sqsEnabled,
    sqsEvents,
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
    chatwootOrganization,
    chatwootLogo,
  }: InstanceDto) {
    try {
      if (token) await this.authService.checkDuplicateToken(token);

      if (!token && integration === Integration.WHATSAPP_BUSINESS) {
        throw new BadRequestException('token is required');
      }

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

      let hash: string;

      if (!token) hash = v4().toUpperCase();
      else hash = token;

      await this.waMonitor.saveInstance({ instanceId, integration, instanceName, hash, number });

      instance.setInstance({
        instanceName,
        instanceId,
        integration,
        token: hash,
        number,
      });

      instance.sendDataWebhook(Events.INSTANCE_CREATE, {
        instanceName,
        instanceId: instanceId,
      });

      this.waMonitor.waInstances[instance.instanceName] = instance;
      this.waMonitor.delInstanceTime(instance.instanceName);

      let getWebhookEvents: string[];

      if (webhookUrl) {
        if (!isURL(webhookUrl, { require_tld: false })) {
          throw new BadRequestException('Invalid "url" property in webhook');
        }

        try {
          let newEvents: string[] = [];
          if (webhookEvents.length === 0) {
            newEvents = [
              'APPLICATION_STARTUP',
              'QRCODE_UPDATED',
              'MESSAGES_SET',
              'MESSAGES_UPSERT',
              'MESSAGES_EDITED',
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
            url: webhookUrl,
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
        try {
          let newEvents: string[] = [];
          if (websocketEvents.length === 0) {
            newEvents = [
              'APPLICATION_STARTUP',
              'QRCODE_UPDATED',
              'MESSAGES_SET',
              'MESSAGES_UPSERT',
              'MESSAGES_EDITED',
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

          getWebsocketEvents = Array.isArray(websocketEventsJson)
            ? websocketEventsJson.map((event) => String(event))
            : [];
        } catch (error) {
          this.logger.log(error);
        }
      }

      let getRabbitmqEvents: string[];

      if (rabbitmqEnabled) {
        try {
          let newEvents: string[] = [];
          if (rabbitmqEvents.length === 0) {
            newEvents = [
              'APPLICATION_STARTUP',
              'QRCODE_UPDATED',
              'MESSAGES_SET',
              'MESSAGES_UPSERT',
              'MESSAGES_EDITED',
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
        } catch (error) {
          this.logger.log(error);
        }
      }

      let getSqsEvents: string[];

      if (sqsEnabled) {
        try {
          let newEvents: string[] = [];
          if (sqsEvents.length === 0) {
            newEvents = [
              'APPLICATION_STARTUP',
              'QRCODE_UPDATED',
              'MESSAGES_SET',
              'MESSAGES_UPSERT',
              'MESSAGES_EDITED',
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

      if (proxyHost && proxyPort && proxyProtocol) {
        const testProxy = await this.proxyService.testProxy({
          host: proxyHost,
          port: proxyPort,
          protocol: proxyProtocol,
          username: proxyUsername,
          password: proxyPassword,
        });
        if (!testProxy) {
          throw new BadRequestException('Invalid proxy');
        }

        await this.proxyService.createProxy(instance, {
          enabled: true,
          host: proxyHost,
          port: proxyPort,
          protocol: proxyProtocol,
          username: proxyUsername,
          password: proxyPassword,
        });
      }

      const settings: wa.LocalSettings = {
        rejectCall: rejectCall === true,
        msgCall: msgCall || '',
        groupsIgnore: groupsIgnore === true,
        alwaysOnline: alwaysOnline === true,
        readMessages: readMessages === true,
        readStatus: readStatus === true,
        syncFullHistory: syncFullHistory === true,
      };

      await this.settingsService.create(instance, settings);

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

      if (!chatwootAccountId || !chatwootToken || !chatwootUrl) {
        let getQrcode: wa.QrCode;

        if (qrcode && integration === Integration.WHATSAPP_BAILEYS) {
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
            webhookUrl,
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
          settings,
          qrcode: getQrcode,
        };

        return result;
      }

      if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED)
        throw new BadRequestException('Chatwoot is not enabled');

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
          organization: chatwootOrganization,
          logo: chatwootLogo,
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
          webhookUrl,
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
      this.logger.error(isArray(error.message) ? error.message[0] : error.message);
      throw new BadRequestException(isArray(error.message) ? error.message[0] : error.message);
    }
  }

  public async connectToWhatsapp({ instanceName, number = null }: InstanceDto) {
    try {
      const instance = this.waMonitor.waInstances[instanceName];
      const state = instance?.connectionStatus?.state;

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
      const instance = this.waMonitor.waInstances[instanceName];
      const state = instance?.connectionStatus?.state;

      switch (state) {
        case 'open':
          if (this.configService.get<Chatwoot>('CHATWOOT').ENABLED) instance.clearCacheChatwoot();
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
    // let arrayReturn = false;

    if (env.KEY !== key) {
      const instanceByKey = await this.prismaRepository.instance.findUnique({
        where: {
          token: key,
        },
      });

      if (instanceByKey) {
        name = instanceByKey.name;
        // arrayReturn = true;
      } else {
        throw new UnauthorizedException();
      }
    }

    if (name) {
      return this.waMonitor.instanceInfo(name);
    } else if (instanceId || number) {
      return this.waMonitor.instanceInfoById(instanceId, number);
    }

    return this.waMonitor.instanceInfo();
  }

  public async setPresence({ instanceName }: InstanceDto, data: SetPresenceDto) {
    return await this.waMonitor.waInstances[instanceName].setPresence(data);
  }

  public async logout({ instanceName }: InstanceDto) {
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
    const { instance } = await this.connectionState({ instanceName });

    if (instance.state === 'open') {
      throw new BadRequestException('The "' + instanceName + '" instance needs to be disconnected');
    }
    try {
      const waInstances = this.waMonitor.waInstances[instanceName];
      waInstances?.removeRabbitmqQueues();
      if (this.configService.get<Chatwoot>('CHATWOOT').ENABLED) waInstances?.clearCacheChatwoot();

      if (instance.state === 'connecting') {
        await this.logout({ instanceName });
      }

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
