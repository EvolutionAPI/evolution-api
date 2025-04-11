import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { CreateQueueCommand, DeleteQueueCommand, ListQueuesCommand, SQS } from '@aws-sdk/client-sqs';
import { configService, Log, Sqs } from '@config/env.config';
import { Logger } from '@config/logger.config';

import { EmitData, EventController, EventControllerInterface } from '../event.controller';
import { EventDto } from '../event.dto';

export class SqsController extends EventController implements EventControllerInterface {
  private sqs: SQS;
  private readonly logger = new Logger('SqsController');

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    super(prismaRepository, waMonitor, configService.get<Sqs>('SQS')?.ENABLED, 'sqs');
  }

  public init(): void {
    if (!this.status) {
      return;
    }

    new Promise<void>((resolve) => {
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

  override async set(instanceName: string, data: EventDto): Promise<any> {
    if (!this.status) {
      return;
    }

    if (!data[this.name]?.enabled) {
      data[this.name].events = [];
    } else {
      if (0 === data[this.name].events.length) {
        data[this.name].events = EventController.events;
      }
    }

    await this.saveQueues(instanceName, data[this.name].events, data[this.name]?.enabled);

    const payload: any = {
      where: {
        instanceId: this.monitor.waInstances[instanceName].instanceId,
      },
      update: {
        enabled: data[this.name]?.enabled,
        events: data[this.name].events,
      },
      create: {
        enabled: data[this.name]?.enabled,
        events: data[this.name].events,
        instanceId: this.monitor.waInstances[instanceName].instanceId,
      },
    };
    console.log('*** payload: ', payload);
    return this.prisma[this.name].upsert(payload);
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
    integration,
  }: EmitData): Promise<void> {
    if (integration && !integration.includes('sqs')) {
      return;
    }

    if (!this.status) {
      return;
    }

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

  private async saveQueues(instanceName: string, events: string[], enable: boolean) {
    if (enable) {
      const eventsFinded = await this.listQueuesByInstance(instanceName);
      console.log('eventsFinded', eventsFinded);

      for (const event of events) {
        const normalizedEvent = event.toLowerCase();

        if (eventsFinded.includes(normalizedEvent)) {
          this.logger.info(`A queue para o evento "${normalizedEvent}" já existe. Ignorando criação.`);
          continue;
        }

        const queueName = `${instanceName}_${normalizedEvent}.fifo`;

        try {
          const createCommand = new CreateQueueCommand({
            QueueName: queueName,
            Attributes: {
              FifoQueue: 'true',
            },
          });
          const data = await this.sqs.send(createCommand);
          this.logger.info(`Queue ${queueName} criada: ${data.QueueUrl}`);
        } catch (err: any) {
          this.logger.error(`Erro ao criar queue ${queueName}: ${err.message}`);
        }
      }
    }
  }

  private async listQueuesByInstance(instanceName: string) {
    let existingQueues: string[] = [];
    try {
      const listCommand = new ListQueuesCommand({
        QueueNamePrefix: `${instanceName}_`,
      });
      const listData = await this.sqs.send(listCommand);
      if (listData.QueueUrls && listData.QueueUrls.length > 0) {
        // Extrai o nome da fila a partir da URL
        existingQueues = listData.QueueUrls.map((queueUrl) => {
          const parts = queueUrl.split('/');
          return parts[parts.length - 1];
        });
      }
    } catch (error: any) {
      this.logger.error(`Erro ao listar filas para a instância ${instanceName}: ${error.message}`);
      return;
    }

    // Mapeia os eventos já existentes nas filas: remove o prefixo e o sufixo ".fifo"
    return existingQueues
      .map((queueName) => {
        // Espera-se que o nome seja `${instanceName}_${event}.fifo`
        if (queueName.startsWith(`${instanceName}_`) && queueName.endsWith('.fifo')) {
          return queueName.substring(instanceName.length + 1, queueName.length - 5).toLowerCase();
        }
        return '';
      })
      .filter((event) => event !== '');
  }

  // Para uma futura feature de exclusão forçada das queues
  private async removeQueuesByInstance(instanceName: string) {
    try {
      const listCommand = new ListQueuesCommand({
        QueueNamePrefix: `${instanceName}_`,
      });
      const listData = await this.sqs.send(listCommand);

      if (!listData.QueueUrls || listData.QueueUrls.length === 0) {
        this.logger.info(`No queues found for instance ${instanceName}`);
        return;
      }

      for (const queueUrl of listData.QueueUrls) {
        try {
          const deleteCommand = new DeleteQueueCommand({ QueueUrl: queueUrl });
          await this.sqs.send(deleteCommand);
          this.logger.info(`Queue ${queueUrl} deleted`);
        } catch (err: any) {
          this.logger.error(`Error deleting queue ${queueUrl}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error listing queues for instance ${instanceName}: ${err.message}`);
    }
  }
}
