import { EventDto } from '@api/integrations/event/event.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { wa } from '@api/types/wa.types';
import { configService, Log, Webhook } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import axios, { AxiosInstance } from 'axios';

import { EmitData, EventController, EventControllerInterface } from '../event.controller';

export class WebhookController extends EventController implements EventControllerInterface {
  private readonly logger = new Logger('WebhookController');

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    super(prismaRepository, waMonitor, true, 'webhook');
  }

  override async set(instanceName: string, data: EventDto): Promise<wa.LocalWebHook> {
    if (!/^(https?:\/\/)/.test(data.webhook.url)) {
      throw new BadRequestException('Invalid "url" property');
    }

    if (!data.webhook?.enabled) {
      data.webhook.events = [];
    } else {
      if (0 === data.webhook.events.length) {
        data.webhook.events = EventController.events;
      }
    }

    return this.prisma.webhook.upsert({
      where: {
        instanceId: this.monitor.waInstances[instanceName].instanceId,
      },
      update: {
        enabled: data.webhook?.enabled,
        events: data.webhook?.events,
        url: data.webhook?.url,
        headers: data.webhook?.headers,
        webhookBase64: data.webhook.base64,
        webhookByEvents: data.webhook.byEvents,
      },
      create: {
        enabled: data.webhook?.enabled,
        events: data.webhook?.events,
        instanceId: this.monitor.waInstances[instanceName].instanceId,
        url: data.webhook?.url,
        headers: data.webhook?.headers,
        webhookBase64: data.webhook.base64,
        webhookByEvents: data.webhook.byEvents,
      },
    });
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
    integration,
  }: EmitData): Promise<void> {
    if(event === 'groups.update')console.dir(4);
    if (integration && !integration.includes('webhook')) {
      return;
    }
    if(event === 'groups.update')console.dir(5);
    const instance = (await this.get(instanceName)) as wa.LocalWebHook;
    if(event === 'groups.update')console.dir(6);
    const webhookConfig = configService.get<Webhook>('WEBHOOK');
    const webhookLocal = instance?.events;
    const webhookHeaders = instance?.headers;
    const we = event.replace(/[.-]/gm, '_').toUpperCase();
    const transformedWe = we.replace(/_/gm, '-').toLowerCase();
    const enabledLog = configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS');
    const regex = /^(https?:\/\/)/;

    const webhookData = {
      event,
      instance: instanceName,
      data,
      destination: instance?.url || `${webhookConfig.GLOBAL.URL}/${transformedWe}`,
      date_time: dateTime,
      sender,
      server_url: serverUrl,
      apikey: apiKey,
    };
    if(event === 'groups.update')console.dir(7);
    if (local && instance?.enabled) {
      if(event === 'groups.update')console.dir(7.1);
      console.dir({webhookLocal, we})
      if (Array.isArray(webhookLocal) && webhookLocal.includes(we)) {
        let baseURL: string;
        if(event === 'groups.update')console.dir(7.2);
        if (instance?.webhookByEvents) {
          if(event === 'groups.update')console.dir(7.21);
          baseURL = `${instance?.url}/${transformedWe}`;
        } else {
          if(event === 'groups.update')console.dir(7.22);
          baseURL = instance?.url;
        }
        if(event === 'groups.update')console.dir(7.3);
        if (enabledLog) {
          const logData = {
            local: `${origin}.sendData-Webhook`,
            url: baseURL,
            ...webhookData,
          };
          if(event === 'groups.update')console.dir(7.4);
          this.logger.log(logData);
        }

        try {
          if(event === 'groups.update')console.dir(7.5);
          if (instance?.enabled && regex.test(instance.url)) {
            if(event === 'groups.update')console.dir(7.6);
            const httpService = axios.create({
              baseURL,
              headers: webhookHeaders as Record<string, string> | undefined,
            });
            if(event === 'groups.update')console.dir(7.7);
            console.dir({url:`${origin}.sendData-Webhook`, baseURL, serverUrl}, {depth: null})
            if(event === 'groups.update')console.dir(7.8);
            await this.retryWebhookRequest(httpService, webhookData, `${origin}.sendData-Webhook`, baseURL, serverUrl);
          }
        } catch (error) {
          this.logger.error({
            local: `${origin}.sendData-Webhook`,
            message: `Todas as tentativas falharam: ${error?.message}`,
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
    if(event === 'groups.update')console.dir(8);
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
          if (regex.test(globalURL)) {
            const httpService = axios.create({ baseURL: globalURL });

            await this.retryWebhookRequest(
              httpService,
              webhookData,
              `${origin}.sendData-Webhook-Global`,
              globalURL,
              serverUrl,
            );
          }
        } catch (error) {
          this.logger.error({
            local: `${origin}.sendData-Webhook-Global`,
            message: `Todas as tentativas falharam: ${error?.message}`,
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
    if(event === 'groups.update')console.dir(9)
  }

  private async retryWebhookRequest(
    httpService: AxiosInstance,
    webhookData: any,
    origin: string,
    baseURL: string,
    serverUrl: string,
    maxRetries = 10,
    delaySeconds = 30,
  ): Promise<void> {
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        await httpService.post('', webhookData);
        if (attempts > 0) {
          this.logger.log({
            local: `${origin}`,
            message: `Sucesso no envio após ${attempts + 1} tentativas`,
            url: baseURL,
          });
        }
        return;
      } catch (error) {
        attempts++;

        this.logger.error({
          local: `${origin}`,
          message: `Tentativa ${attempts}/${maxRetries} falhou: ${error?.message}`,
          hostName: error?.hostname,
          syscall: error?.syscall,
          code: error?.code,
          error: error?.errno,
          stack: error?.stack,
          name: error?.name,
          url: baseURL,
          server_url: serverUrl,
        });

        if (attempts === maxRetries) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
      }
    }
  }
}
