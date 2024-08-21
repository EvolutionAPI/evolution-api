import { SqsDto } from '@api/integrations/event/sqs/dto/sqs.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { wa } from '@api/types/wa.types';
import { SQS } from '@aws-sdk/client-sqs';
import { configService, Log, Sqs } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { NotFoundException } from '@exceptions';

import { EmitData, EventController, EventControllerInterface } from '../../event.controller';

export class SqsController extends EventController implements EventControllerInterface {
  private sqs: SQS;
  private readonly logger = new Logger(SqsController.name);
  integrationEnabled = configService.get<Sqs>('SQS')?.ENABLED;

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    super(prismaRepository, waMonitor);
  }

  public init(): void {
    if (!this.integrationEnabled) return;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    new Promise<void>((resolve, reject) => {
      const awsConfig = configService.get<Sqs>('SQS');
      this.sqs = new SQS({
        credentials: {
          accessKeyId: awsConfig.ACCESS_KEY_ID,
          secretAccessKey: awsConfig.SECRET_ACCESS_KEY,
        },

        region: awsConfig.REGION,
      });

      this.logger.info('SQS initialized');
      resolve();
    });
  }

  private set channel(sqs: SQS) {
    this.sqs = sqs;
  }

  public get channel(): SQS {
    return this.sqs;
  }

  public async set(instanceName: string, data: SqsDto): Promise<wa.LocalSqs> {
    if (!this.integrationEnabled) return;

    if (!data.enabled) {
      data.events = [];
    } else {
      if (0 === data.events.length) {
        data.events = this.events;
      }
    }

    try {
      await this.get(instanceName);

      return this.prisma.sqs.update({
        where: {
          instanceId: this.monitor.waInstances[instanceName].instanceId,
        },
        data,
      });
    } catch (err) {
      return this.prisma.sqs.create({
        data: {
          enabled: data.enabled,
          events: data.events,
          instanceId: this.monitor.waInstances[instanceName].instanceId,
        },
      });
    }
  }

  public async get(instanceName: string): Promise<wa.LocalSqs> {
    if (!this.integrationEnabled) return;

    if (undefined === this.monitor.waInstances[instanceName]) {
      throw new NotFoundException('Instance not found');
    }

    const data = await this.prisma.sqs.findUnique({
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
  }: EmitData): Promise<void> {
    if (!this.integrationEnabled) return;

    const instanceSqs = await this.get(instanceName);
    const sqsLocal = instanceSqs?.events;
    const we = event.replace(/[.-]/gm, '_').toUpperCase();

    if (instanceSqs?.enabled) {
      if (this.sqs) {
        if (Array.isArray(sqsLocal) && sqsLocal.includes(we)) {
          const eventFormatted = `${event.replace('.', '_').toLowerCase()}`;

          const queueName = `${instanceName}_${eventFormatted}.fifo`;

          const sqsConfig = configService.get<Sqs>('SQS');

          const sqsUrl = `https://sqs.${sqsConfig.REGION}.amazonaws.com/${sqsConfig.ACCOUNT_ID}/${queueName}`;

          const message = {
            event,
            instance: instanceName,
            data,
            server_url: serverUrl,
            date_time: dateTime,
            sender,
            apikey: apiKey,
          };

          const params = {
            MessageBody: JSON.stringify(message),
            MessageGroupId: 'evolution',
            MessageDeduplicationId: `${instanceName}_${eventFormatted}_${Date.now()}`,
            QueueUrl: sqsUrl,
          };

          this.sqs.sendMessage(params, (err) => {
            if (err) {
              this.logger.error({
                local: `${origin}.sendData-SQS`,
                message: err?.message,
                hostName: err?.hostname,
                code: err?.code,
                stack: err?.stack,
                name: err?.name,
                url: queueName,
                server_url: serverUrl,
              });
            } else {
              if (configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS')) {
                const logData = {
                  local: `${origin}.sendData-SQS`,
                  ...message,
                };

                this.logger.log(logData);
              }
            }
          });
        }
      }
    }
  }

  public async initQueues(instanceName: string, events: string[]) {
    if (!events || !events.length) return;

    const queues = events.map((event) => {
      return `${event.replace(/_/g, '_').toLowerCase()}`;
    });

    queues.forEach((event) => {
      const queueName = `${instanceName}_${event}.fifo`;

      this.sqs.createQueue(
        {
          QueueName: queueName,
          Attributes: {
            FifoQueue: 'true',
          },
        },
        (err, data) => {
          if (err) {
            this.logger.error(`Error creating queue ${queueName}: ${err.message}`);
          } else {
            this.logger.info(`Queue ${queueName} created: ${data.QueueUrl}`);
          }
        },
      );
    });
  }

  public async removeQueues(instanceName: string, events: any) {
    const eventsArray = Array.isArray(events) ? events.map((event) => String(event)) : [];
    if (!events || !eventsArray.length) return;

    const queues = eventsArray.map((event) => {
      return `${event.replace(/_/g, '_').toLowerCase()}`;
    });

    queues.forEach((event) => {
      const queueName = `${instanceName}_${event}.fifo`;

      this.sqs.getQueueUrl(
        {
          QueueName: queueName,
        },
        (err, data) => {
          if (err) {
            this.logger.error(`Error getting queue URL for ${queueName}: ${err.message}`);
          } else {
            const queueUrl = data.QueueUrl;

            this.sqs.deleteQueue(
              {
                QueueUrl: queueUrl,
              },
              (deleteErr) => {
                if (deleteErr) {
                  this.logger.error(`Error deleting queue ${queueName}: ${deleteErr.message}`);
                } else {
                  this.logger.info(`Queue ${queueName} deleted`);
                }
              },
            );
          }
        },
      );
    });
  }
}
