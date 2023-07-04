import { delay } from '@whiskeysockets/baileys';
import EventEmitter2 from 'eventemitter2';
import { Auth, ConfigService } from '../../config/env.config';
import { BadRequestException, InternalServerErrorException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
import { RepositoryBroker } from '../repository/repository.manager';
import { AuthService, OldToken } from '../services/auth.service';
import { WAMonitoringService } from '../services/monitor.service';
import { WAStartupService } from '../services/whatsapp.service';
import { WebhookService } from '../services/webhook.service';
import { Logger } from '../../config/logger.config';
import { wa } from '../types/wa.types';
import { RedisCache } from '../../db/redis.client';

export class InstanceController {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly repository: RepositoryBroker,
    private readonly eventEmitter: EventEmitter2,
    private readonly authService: AuthService,
    private readonly webhookService: WebhookService,
    private readonly cache: RedisCache,
  ) {}

  private readonly logger = new Logger(InstanceController.name);

  public async createInstance({
    instanceName,
    webhook,
    webhook_by_events,
    events,
    qrcode,
    token,
  }: InstanceDto) {
    const mode = this.configService.get<Auth>('AUTHENTICATION').INSTANCE.MODE;

    if (mode === 'container') {
      if (Object.keys(this.waMonitor.waInstances).length > 0) {
        throw new BadRequestException([
          'Instance already created',
          'Only one instance can be created',
        ]);
      }

      await this.authService.checkDuplicateToken(token);

      const instance = new WAStartupService(
        this.configService,
        this.eventEmitter,
        this.repository,
        this.cache,
      );
      instance.instanceName = instanceName;
      this.waMonitor.waInstances[instance.instanceName] = instance;
      this.waMonitor.delInstanceTime(instance.instanceName);

      const hash = await this.authService.generateHash(
        {
          instanceName: instance.instanceName,
        },
        token,
      );

      let getEvents: string[];

      if (webhook) {
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

      return {
        instance: {
          instanceName: instance.instanceName,
          status: 'created',
        },
        hash,
        webhook,
        events: getEvents,
      };
    } else {
      await this.authService.checkDuplicateToken(token);

      const instance = new WAStartupService(
        this.configService,
        this.eventEmitter,
        this.repository,
        this.cache,
      );
      instance.instanceName = instanceName;
      this.waMonitor.waInstances[instance.instanceName] = instance;
      this.waMonitor.delInstanceTime(instance.instanceName);

      const hash = await this.authService.generateHash(
        {
          instanceName: instance.instanceName,
        },
        token,
      );

      let getEvents: string[];

      if (webhook) {
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

      let getQrcode: wa.QrCode;

      if (qrcode) {
        await instance.connectToWhatsapp();
        await delay(2000);
        getQrcode = instance.qrCode;
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
        qrcode: getQrcode,
      };
    }
  }

  public async connectToWhatsapp({ instanceName }: InstanceDto) {
    try {
      const instance = this.waMonitor.waInstances[instanceName];
      const state = instance?.connectionStatus?.state;

      switch (state) {
        case 'close':
          await instance.connectToWhatsapp();
          await delay(2000);
          return instance.qrCode;
        case 'connecting':
          return instance.qrCode;
        default:
          return await this.connectionState({ instanceName });
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async restartInstance({ instanceName }: InstanceDto) {
    try {
      delete this.waMonitor.waInstances[instanceName];
      console.log(this.waMonitor.waInstances[instanceName]);
      const instance = new WAStartupService(
        this.configService,
        this.eventEmitter,
        this.repository,
        this.cache,
      );

      instance.instanceName = instanceName;
      await instance.connectToWhatsapp();
      this.waMonitor.waInstances[instance.instanceName] = instance;

      return { error: false, message: 'Instance restarted' };
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async connectionState({ instanceName }: InstanceDto) {
    return this.waMonitor.waInstances[instanceName]?.connectionStatus;
  }

  public async fetchInstances({ instanceName }: InstanceDto) {
    if (instanceName) {
      return this.waMonitor.instanceInfo(instanceName);
    }

    return this.waMonitor.instanceInfo();
  }

  public async logout({ instanceName }: InstanceDto) {
    try {
      await this.waMonitor.waInstances[instanceName]?.client?.logout(
        'Log out instance: ' + instanceName,
      );

      this.waMonitor.waInstances[instanceName]?.client?.ws?.close();
      this.waMonitor.waInstances[instanceName]?.client?.end(undefined);

      return { error: false, message: 'Instance logged out' };
    } catch (error) {
      throw new InternalServerErrorException(error.toString());
    }
  }

  public async deleteInstance({ instanceName }: InstanceDto) {
    const stateConn = await this.connectionState({ instanceName });
    if (stateConn.state === 'open') {
      throw new BadRequestException([
        'Deletion failed',
        'The instance needs to be disconnected',
      ]);
    }
    try {
      if (stateConn.state === 'connecting') {
        await this.logout({ instanceName });
        delete this.waMonitor.waInstances[instanceName];
        return { error: false, message: 'Instance deleted' };
      } else {
        delete this.waMonitor.waInstances[instanceName];
        this.eventEmitter.emit('remove.instance', instanceName, 'inner');
        return { error: false, message: 'Instance deleted' };
      }
    } catch (error) {
      throw new BadRequestException(error.toString());
    }
  }

  public async refreshToken(_: InstanceDto, oldToken: OldToken) {
    return await this.authService.refreshToken(oldToken);
  }
}
