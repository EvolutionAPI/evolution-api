import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { wa } from '@api/types/wa.types';
import { configService, Log, Webhook } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException, NotFoundException } from '@exceptions';
import axios from 'axios';
import { isURL } from 'class-validator';

import { EmitData, EventController, EventControllerInterface } from '../../event.controller';
import { WebhookDto } from '../dto/webhook.dto';

export class WebhookController extends EventController implements EventControllerInterface {
  private readonly logger = new Logger(WebhookController.name);

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    super(prismaRepository, waMonitor);
  }
  integrationEnabled: boolean;

  public async set(instanceName: string, data: WebhookDto): Promise<wa.LocalWebHook> {
    if (!isURL(data.url, { require_tld: false })) {
      throw new BadRequestException('Invalid "url" property');
    }

    if (!data.enabled) {
      data.events = [];
    } else {
      if (0 === data.events.length) {
        data.events = this.events;
      }
    }

    await this.get(instanceName);

    return this.prisma.webhook.upsert({
      where: {
        instanceId: this.monitor.waInstances[instanceName].instanceId,
      },
      update: {
        ...data,
      },
      create: {
        enabled: data.enabled,
        events: data.events,
        instanceId: this.monitor.waInstances[instanceName].instanceId,
        url: data.url,
        webhookBase64: data.webhookBase64,
        webhookByEvents: data.webhookByEvents,
      },
    });
  }

  public async get(instanceName: string): Promise<wa.LocalWebHook> {
    if (undefined === this.monitor.waInstances[instanceName]) {
      throw new NotFoundException('Instance not found');
    }

    const data = await this.prisma.webhook.findUnique({
      where: {
        instanceId: this.monitor.waInstances[instanceName].instanceId,
      },
    });

    if (!data) {
      return null;
    }

    return data;
  }

  public async emit({
    instanceName,
    origin,
    event,
    data,
    serverUrl,
    dateTime,
    sender,
    apiKey,
    local,
  }: EmitData): Promise<void> {
    const instanceWebhook = await this.get(instanceName);
    if (!instanceWebhook || !instanceWebhook.enabled) {
      return;
    }

    const webhookConfig = configService.get<Webhook>('WEBHOOK');
    const webhookLocal = instanceWebhook?.events;
    const we = event.replace(/[.-]/gm, '_').toUpperCase();
    const transformedWe = we.replace(/_/gm, '-').toLowerCase();
    const enabledLog = configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS');

    const webhookData = {
      event,
      instance: instanceName,
      data,
      destination: instanceWebhook?.url,
      date_time: dateTime,
      sender,
      server_url: serverUrl,
      apikey: apiKey,
    };

    if (local) {
      if (Array.isArray(webhookLocal) && webhookLocal.includes(we)) {
        let baseURL: string;

        if (instanceWebhook?.webhookByEvents) {
          baseURL = `${instanceWebhook?.url}/${transformedWe}`;
        } else {
          baseURL = instanceWebhook?.url;
        }

        if (enabledLog) {
          const logData = {
            local: `${origin}.sendData-Webhook`,
            url: baseURL,
            ...webhookData,
          };

          this.logger.log(logData);
        }

        try {
          if (instanceWebhook?.enabled && isURL(instanceWebhook.url, { require_tld: false })) {
            const httpService = axios.create({ baseURL });

            await httpService.post('', webhookData);
          }
        } catch (error) {
          this.logger.error({
            local: `${origin}.sendData-Webhook`,
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

    if (webhookConfig.GLOBAL?.ENABLED) {
      if (webhookConfig.EVENTS[we]) {
        let globalURL = webhookConfig.GLOBAL.URL;

        if (webhookConfig.GLOBAL.WEBHOOK_BY_EVENTS) {
          globalURL = `${globalURL}/${transformedWe}`;
        }

        if (enabledLog) {
          const logData = {
            local: `${origin}.sendData-Webhook-Global`,
            url: globalURL,
            ...webhookData,
          };

          this.logger.log(logData);
        }

        try {
          if (isURL(globalURL)) {
            const httpService = axios.create({ baseURL: globalURL });

            await httpService.post('', webhookData);
          }
        } catch (error) {
          this.logger.error({
            local: `${origin}.sendData-Webhook-Global`,
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
}
