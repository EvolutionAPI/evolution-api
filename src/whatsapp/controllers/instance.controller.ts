import { delay } from '@whiskeysockets/baileys';
import EventEmitter2 from 'eventemitter2';
import { Auth, ConfigService, HttpServer } from '../../config/env.config';
import { BadRequestException, InternalServerErrorException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
import { RepositoryBroker } from '../repository/repository.manager';
import { AuthService, OldToken } from '../services/auth.service';
import { WAMonitoringService } from '../services/monitor.service';
import { WAStartupService } from '../services/whatsapp.service';
import { WebhookService } from '../services/webhook.service';
import { ChatwootService } from '../services/chatwoot.service';
import { Logger } from '../../config/logger.config';
import { wa } from '../types/wa.types';
import { RedisCache } from '../../db/redis.client';
import { isURL } from 'class-validator';

export class InstanceController {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly repository: RepositoryBroker,
    private readonly eventEmitter: EventEmitter2,
    private readonly authService: AuthService,
    private readonly webhookService: WebhookService,
    private readonly chatwootService: ChatwootService,
    private readonly cache: RedisCache,
  ) {}

  private readonly logger = new Logger(InstanceController.name);

  public async createInstance({
    instanceName,
    webhook,
    webhook_by_events,
    events,
    qrcode,
    number,
    token,
    chatwoot_account_id,
    chatwoot_token,
    chatwoot_url,
    chatwoot_sign_msg,
  }: InstanceDto) {
    try {
      this.logger.verbose('requested createInstance from ' + instanceName + ' instance');

      if (instanceName !== instanceName.toLowerCase().replace(/[^a-z0-9]/g, '')) {
        throw new BadRequestException(
          'The instance name must be lowercase and without special characters',
        );
      }

      this.logger.verbose('checking duplicate token');
      await this.authService.checkDuplicateToken(token);

      this.logger.verbose('creating instance');
      const instance = new WAStartupService(
        this.configService,
        this.eventEmitter,
        this.repository,
        this.cache,
      );
      instance.instanceName = instanceName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(' ', '');

      this.logger.verbose('instance: ' + instance.instanceName + ' created');

      this.waMonitor.waInstances[instance.instanceName] = instance;
      this.waMonitor.delInstanceTime(instance.instanceName);

      this.logger.verbose('generating hash');
      const hash = await this.authService.generateHash(
        {
          instanceName: instance.instanceName,
        },
        token,
      );

      this.logger.verbose('hash: ' + hash + ' generated');

      let getEvents: string[];

      if (webhook) {
        if (!isURL(webhook, { require_tld: false })) {
          throw new BadRequestException('Invalid "url" property in webhook');
        }

        this.logger.verbose('creating webhook');
        try {
          this.webhookService.create(instance, {
            enabled: true,
            url: webhook,
            events,
            webhook_by_events,
          });

          getEvents = (await this.webhookService.find(instance)).events;
        } catch (error) {
          this.logger.log(error);
        }
      }

      if (!chatwoot_account_id || !chatwoot_token || !chatwoot_url) {
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
            status: 'created',
          },
          hash,
          webhook,
          webhook_by_events,
          events: getEvents,
          qrcode: getQrcode,
        };

        this.logger.verbose('instance created');
        this.logger.verbose(result);

        return result;
      }

      if (!chatwoot_account_id) {
        throw new BadRequestException('account_id is required');
      }

      if (!chatwoot_token) {
        throw new BadRequestException('token is required');
      }

      if (!chatwoot_url) {
        throw new BadRequestException('url is required');
      }

      if (!isURL(chatwoot_url, { require_tld: false })) {
        throw new BadRequestException('Invalid "url" property in chatwoot');
      }

      const urlServer = this.configService.get<HttpServer>('SERVER').URL;

      try {
        this.chatwootService.create(instance, {
          enabled: true,
          account_id: chatwoot_account_id,
          token: chatwoot_token,
          url: chatwoot_url,
          sign_msg: chatwoot_sign_msg || false,
          name_inbox: instance.instanceName,
          number,
        });

        this.chatwootService.initInstanceChatwoot(
          instance,
          instance.instanceName,
          `${urlServer}/chatwoot/webhook/${instance.instanceName}`,
          qrcode,
          number,
        );
      } catch (error) {
        this.logger.log(error);
      }

      return {
        instance: {
          instanceName: instance.instanceName,
          status: 'created',
        },
        hash,
        webhook,
        webhook_by_events,
        events: getEvents,
        chatwoot: {
          enabled: true,
          account_id: chatwoot_account_id,
          token: chatwoot_token,
          url: chatwoot_url,
          sign_msg: chatwoot_sign_msg || false,
          number,
          name_inbox: instance.instanceName,
          webhook_url: `${urlServer}/chatwoot/webhook/${instance.instanceName}`,
        },
      };
    } catch (error) {
      console.log(error);
      return { error: true, message: error.toString() };
    }
  }

  public async connectToWhatsapp({ instanceName, number = null }: InstanceDto) {
    try {
      this.logger.verbose(
        'requested connectToWhatsapp from ' + instanceName + ' instance',
      );

      const instance = this.waMonitor.waInstances[instanceName];
      const state = instance?.connectionStatus?.state;

      this.logger.verbose('state: ' + state);

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

      this.logger.verbose('logging out instance: ' + instanceName);
      this.waMonitor.waInstances[instanceName]?.client?.ws?.close();

      return { error: false, message: 'Instance restarted' };
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

  public async fetchInstances({ instanceName }: InstanceDto) {
    this.logger.verbose('requested fetchInstances from ' + instanceName + ' instance');
    if (instanceName) {
      this.logger.verbose('instanceName: ' + instanceName);
      return this.waMonitor.instanceInfo(instanceName);
    }

    return this.waMonitor.instanceInfo();
  }

  public async logout({ instanceName }: InstanceDto) {
    this.logger.verbose('requested logout from ' + instanceName + ' instance');
    const { instance } = await this.connectionState({ instanceName });

    if (instance.state === 'close') {
      throw new BadRequestException(
        'The "' + instanceName + '" instance is not connected',
      );
    }

    try {
      this.logger.verbose('logging out instance: ' + instanceName);
      await this.waMonitor.waInstances[instanceName]?.client?.logout(
        'Log out instance: ' + instanceName,
      );

      this.logger.verbose('close connection instance: ' + instanceName);
      this.waMonitor.waInstances[instanceName]?.client?.ws?.close();

      return { error: false, message: 'Instance logged out' };
    } catch (error) {
      throw new InternalServerErrorException(error.toString());
    }
  }

  public async deleteInstance({ instanceName }: InstanceDto) {
    this.logger.verbose('requested deleteInstance from ' + instanceName + ' instance');
    const { instance } = await this.connectionState({ instanceName });

    if (instance.state === 'open') {
      throw new BadRequestException(
        'The "' + instanceName + '" instance needs to be disconnected',
      );
    }
    try {
      if (instance.state === 'connecting') {
        this.logger.verbose('logging out instance: ' + instanceName);

        await this.logout({ instanceName });
        delete this.waMonitor.waInstances[instanceName];
        return { error: false, message: 'Instance deleted' };
      } else {
        this.logger.verbose('deleting instance: ' + instanceName);

        delete this.waMonitor.waInstances[instanceName];
        this.eventEmitter.emit('remove.instance', instanceName, 'inner');
        return { error: false, message: 'Instance deleted' };
      }
    } catch (error) {
      throw new BadRequestException(error.toString());
    }
  }

  public async refreshToken(_: InstanceDto, oldToken: OldToken) {
    this.logger.verbose('requested refreshToken');
    return await this.authService.refreshToken(oldToken);
  }
}
