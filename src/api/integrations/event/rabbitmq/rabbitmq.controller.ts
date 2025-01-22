import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { configService, Log, Rabbitmq } from '@config/env.config';
import { Logger } from '@config/logger.config';
import * as amqp from 'amqplib/callback_api';

import { EmitData, EventController, EventControllerInterface } from '../event.controller';

export class RabbitmqController extends EventController implements EventControllerInterface {
  public amqpChannel: amqp.Channel | null = null;
  private readonly logger = new Logger('RabbitmqController');

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    super(prismaRepository, waMonitor, configService.get<Rabbitmq>('RABBITMQ')?.ENABLED, 'rabbitmq');
  }

  public async init(): Promise<void> {
    if (!this.status) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const uri = configService.get<Rabbitmq>('RABBITMQ').URI;
      const rabbitmqExchangeName = configService.get<Rabbitmq>('RABBITMQ').EXCHANGE_NAME;

      amqp.connect(uri, (error, connection) => {
        if (error) {
          reject(error);

          return;
        }

        connection.createChannel((channelError, channel) => {
          if (channelError) {
            reject(channelError);

            return;
          }

          const exchangeName = rabbitmqExchangeName;

          channel.assertExchange(exchangeName, 'topic', {
            durable: true,
            autoDelete: false,
          });

          this.amqpChannel = channel;

          this.logger.info('AMQP initialized');

          resolve();
        });
      });
    }).then(() => {
      if (configService.get<Rabbitmq>('RABBITMQ')?.GLOBAL_ENABLED) this.initGlobalQueues();
    });
  }

  private set channel(channel: amqp.Channel) {
    this.amqpChannel = channel;
  }

  public get channel(): amqp.Channel {
    return this.amqpChannel;
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
    if (integration && !integration.includes('rabbitmq')) {
      return;
    }

    if (!this.status) {
      return;
    }

    const instanceRabbitmq = await this.get(instanceName);
    const rabbitmqLocal = instanceRabbitmq?.events;
    const rabbitmqGlobal = configService.get<Rabbitmq>('RABBITMQ').GLOBAL_ENABLED;
    const rabbitmqEvents = configService.get<Rabbitmq>('RABBITMQ').EVENTS;
    const rabbitmqExchangeName = configService.get<Rabbitmq>('RABBITMQ').EXCHANGE_NAME;
    const we = event.replace(/[.-]/gm, '_').toUpperCase();
    const logEnabled = configService.get<Log>('LOG').LEVEL.includes('WEBHOOKS');

    const message = {
      event,
      instance: instanceName,
      data,
      server_url: serverUrl,
      date_time: dateTime,
      sender,
      apikey: apiKey,
    };

    if (instanceRabbitmq?.enabled && this.amqpChannel) {
      if (Array.isArray(rabbitmqLocal) && rabbitmqLocal.includes(we)) {
        const exchangeName = instanceName ?? rabbitmqExchangeName;

        let retry = 0;

        while (retry < 3) {
          try {
            await this.amqpChannel.assertExchange(exchangeName, 'topic', {
              durable: true,
              autoDelete: false,
            });

            const eventName = event.replace(/_/g, '.').toLowerCase();

            const queueName = `${instanceName}.${eventName}`;

            await this.amqpChannel.assertQueue(queueName, {
              durable: true,
              autoDelete: false,
              arguments: {
                'x-queue-type': 'quorum',
              },
            });

            await this.amqpChannel.bindQueue(queueName, exchangeName, eventName);

            await this.amqpChannel.publish(exchangeName, event, Buffer.from(JSON.stringify(message)));

            if (logEnabled) {
              const logData = {
                local: `${origin}.sendData-RabbitMQ`,
                ...message,
              };

              this.logger.log(logData);
            }

            break;
          } catch (error) {
            retry++;
          }
        }
      }
    }

    if (rabbitmqGlobal && rabbitmqEvents[we] && this.amqpChannel) {
      const exchangeName = rabbitmqExchangeName;

      let retry = 0;

      while (retry < 3) {
        try {
          await this.amqpChannel.assertExchange(exchangeName, 'topic', {
            durable: true,
            autoDelete: false,
          });

          const queueName = event;

          await this.amqpChannel.assertQueue(queueName, {
            durable: true,
            autoDelete: false,
            arguments: {
              'x-queue-type': 'quorum',
            },
          });

          await this.amqpChannel.bindQueue(queueName, exchangeName, event);

          await this.amqpChannel.publish(exchangeName, event, Buffer.from(JSON.stringify(message)));

          if (logEnabled) {
            const logData = {
              local: `${origin}.sendData-RabbitMQ-Global`,
              ...message,
            };

            this.logger.log(logData);
          }

          break;
        } catch (error) {
          retry++;
        }
      }
    }
  }

  private async initGlobalQueues(): Promise<void> {
    this.logger.info('Initializing global queues');

    const rabbitmqExchangeName = configService.get<Rabbitmq>('RABBITMQ').EXCHANGE_NAME;
    const events = configService.get<Rabbitmq>('RABBITMQ').EVENTS;

    if (!events) {
      this.logger.warn('No events to initialize on AMQP');

      return;
    }

    const eventKeys = Object.keys(events);

    eventKeys.forEach((event) => {
      if (events[event] === false) return;

      const queueName = `${event.replace(/_/g, '.').toLowerCase()}`;
      const exchangeName = rabbitmqExchangeName;

      this.amqpChannel.assertExchange(exchangeName, 'topic', {
        durable: true,
        autoDelete: false,
      });

      this.amqpChannel.assertQueue(queueName, {
        durable: true,
        autoDelete: false,
        arguments: {
          'x-queue-type': 'quorum',
        },
      });

      this.amqpChannel.bindQueue(queueName, exchangeName, event);
    });
  }
}
