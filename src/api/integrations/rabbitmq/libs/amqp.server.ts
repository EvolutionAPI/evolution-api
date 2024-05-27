import * as amqp from 'amqplib/callback_api';

import { configService, Rabbitmq } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';

const logger = new Logger('AMQP');

let amqpChannel: amqp.Channel | null = null;

export const initAMQP = () => {
  return new Promise<void>((resolve, reject) => {
    const uri = configService.get<Rabbitmq>('RABBITMQ').URI;
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

        const exchangeName = 'evolution_exchange';

        channel.assertExchange(exchangeName, 'topic', {
          durable: true,
          autoDelete: false,
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

export const initGlobalQueues = () => {
  logger.info('Initializing global queues');
  const events = configService.get<Rabbitmq>('RABBITMQ').EVENTS;

  if (!events) {
    logger.warn('No events to initialize on AMQP');
    return;
  }

  const eventKeys = Object.keys(events);

  eventKeys.forEach((event) => {
    if (events[event] === false) return;

    const queueName = `${event.replace(/_/g, '.').toLowerCase()}`;
    const amqp = getAMQP();
    const exchangeName = 'evolution_exchange';

    amqp.assertExchange(exchangeName, 'topic', {
      durable: true,
      autoDelete: false,
    });

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

export const initQueues = (instanceName: string, events: string[]) => {
  if (!events || !events.length) return;

  const queues = events.map((event) => {
    return `${event.replace(/_/g, '.').toLowerCase()}`;
  });

  queues.forEach((event) => {
    const amqp = getAMQP();
    const exchangeName = instanceName ?? 'evolution_exchange';

    amqp.assertExchange(exchangeName, 'topic', {
      durable: true,
      autoDelete: false,
    });

    const queueName = `${instanceName}.${event}`;

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
    });

    const queueName = `${instanceName}.${event}`;

    amqp.deleteQueue(queueName);
  });

  channel.deleteExchange(exchangeName);
};
