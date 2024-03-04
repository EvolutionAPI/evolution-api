import * as amqp from 'amqplib/callback_api';

import { configService, HttpServer, Rabbitmq } from '../config/env.config';
import { Logger } from '../config/logger.config';

const logger = new Logger('AMQP');

let amqpChannel: amqp.Channel | null = null;

export const initAMQP = () => {
  return new Promise<void>((resolve, reject) => {
    const rabbitConfig = configService.get<Rabbitmq>('RABBITMQ');
    amqp.connect(rabbitConfig.URI, (error, connection) => {
      if (error) {
        reject(error);
        return;
      }

      connection.createChannel((channelError, channel) => {
        if (channelError) {
          reject(channelError);
          return;
        }

        const exchangeName = 'evolution_exchange';

        channel.assertExchange(exchangeName, 'topic', {
          durable: true,
          autoDelete: false,
          assert: true,
        });

        amqpChannel = channel;

        logger.info('AMQP initialized');
        resolve();
      });
    });
  });
};

export const getAMQP = (): amqp.Channel | null => {
  return amqpChannel;
};

export const initQueues = (instanceName: string, events: string[]) => {
  if (!instanceName || !events || !events.length) return;
  const rabbitConfig = configService.get<Rabbitmq>('RABBITMQ');

  const queues = events.map((event) => {
    return `${event.replace(/_/g, '.').toLowerCase()}`;
  });

  queues.forEach((event) => {
    const amqp = getAMQP();
    const exchangeName = instanceName ?? 'evolution_exchange';

    amqp.assertExchange(exchangeName, 'topic', {
      durable: true,
      autoDelete: false,
      assert: true,
    });

    const queueName = rabbitConfig.GLOBAL_EVENT_QUEUE ? event : `${instanceName}.${event}`;

    amqp.assertQueue(queueName, {
      durable: true,
      autoDelete: false,
      arguments: {
        'x-queue-type': 'quorum',
      },
    });

    amqp.bindQueue(queueName, exchangeName, event);
  });
};

export const removeQueues = (instanceName: string, events: string[]) => {
  if (!events || !events.length) return;
  const rabbitConfig = configService.get<Rabbitmq>('RABBITMQ');

  const channel = getAMQP();

  const queues = events.map((event) => {
    return `${event.replace(/_/g, '.').toLowerCase()}`;
  });

  const exchangeName = instanceName ?? 'evolution_exchange';

  queues.forEach((event) => {
    const amqp = getAMQP();

    amqp.assertExchange(exchangeName, 'topic', {
      durable: true,
      autoDelete: false,
      assert: true,
    });

    const queueName = rabbitConfig.GLOBAL_EVENT_QUEUE ? event : `${instanceName}.${event}`;

    amqp.deleteQueue(queueName);
  });

  channel.deleteExchange(exchangeName);
};

interface SendEventData {
  instanceName: string;
  wuid: string;
  event: string;
  apiKey?: string;
  data: any;
}

export const sendEventData = ({ data, event, wuid, apiKey, instanceName }: SendEventData) => {
  const exchangeName = instanceName ?? 'evolution_exchange';

  amqpChannel.assertExchange(exchangeName, 'topic', {
    durable: true,
    autoDelete: false,
    assert: true,
  });

  const rabbitConfig = configService.get<Rabbitmq>('RABBITMQ');
  const queueName = rabbitConfig.GLOBAL_EVENT_QUEUE ? event : `${instanceName}.${event}`;

  amqpChannel.assertQueue(queueName, {
    durable: true,
    autoDelete: false,
    arguments: { 'x-queue-type': 'quorum' },
  });

  amqpChannel.bindQueue(queueName, exchangeName, event);

  const serverUrl = configService.get<HttpServer>('SERVER').URL;
  const tzoffset = new Date().getTimezoneOffset() * 60000; //offset in milliseconds
  const localISOTime = new Date(Date.now() - tzoffset).toISOString();
  const now = localISOTime;

  const message = {
    event,
    instance: instanceName,
    data,
    server_url: serverUrl,
    date_time: now,
    sender: wuid,
  };

  if (apiKey) {
    message['apikey'] = apiKey;
  }

  logger.log({
    queueName,
    exchangeName,
    event,
  });
  amqpChannel.publish(exchangeName, event, Buffer.from(JSON.stringify(message)));
};
