import * as amqp from 'amqplib/callback_api';

import { configService, Rabbitmq } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';

const logger = new Logger('AMQP');

let amqpChannel: amqp.Channel | null = null;
let amqpConnection: amqp.Connection | null = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectInterval = 5000; // 5 segundos

type ResolveCallback = () => void;
type RejectCallback = (error: Error) => void;

export const initAMQP = () => {
  return new Promise<void>((resolve, reject) => {
    connectToRabbitMQ(resolve, reject);
  });
};

const connectToRabbitMQ = (resolve?: ResolveCallback, reject?: RejectCallback) => {
  const uri = configService.get<Rabbitmq>('RABBITMQ').URI;
  amqp.connect(uri, (error, connection) => {
    if (error) {
      logger.error(`Failed to connect to RabbitMQ: ${error.message}`);
      handleConnectionError(error, resolve, reject);
      return;
    }

    reconnectAttempts = 0;
    amqpConnection = connection;

    connection.on('error', (err) => {
      logger.error(`RabbitMQ connection error: ${err.message}`);
      scheduleReconnect();
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed unexpectedly');
      scheduleReconnect();
    });

    createChannel(connection, resolve, reject);
  });
};

const createChannel = (connection: amqp.Connection, resolve?: ResolveCallback, reject?: RejectCallback) => {
  connection.createChannel((channelError, channel) => {
    if (channelError) {
      logger.error(`Failed to create channel: ${channelError.message}`);
      if (reject) {
        reject(channelError);
      }
      return;
    }

    const exchangeName = 'evolution_exchange';

    channel.assertExchange(exchangeName, 'topic', {
      durable: true,
      autoDelete: false,
    });

    channel.on('error', (err) => {
      logger.error(`RabbitMQ channel error: ${err.message}`);
      amqpChannel = null;
      createChannel(connection);
    });

    channel.on('close', () => {
      logger.warn('RabbitMQ channel closed');
      amqpChannel = null;
      createChannel(connection);
    });

    amqpChannel = channel;

    logger.info('AMQP initialized');
    if (resolve) {
      resolve();
    }
  });
};

const scheduleReconnect = () => {
  if (reconnectAttempts >= maxReconnectAttempts) {
    logger.error(`Exceeded maximum ${maxReconnectAttempts} reconnection attempts to RabbitMQ`);
    return;
  }

  amqpChannel = null;

  if (amqpConnection) {
    try {
      amqpConnection.close();
    } catch (err) {
      // Ignora erro ao fechar conexão que já pode estar fechada
    }
    amqpConnection = null;
  }

  reconnectAttempts++;
  const delay = reconnectInterval * Math.pow(1.5, reconnectAttempts - 1); // Backoff exponencial

  logger.info(`Reconnection attempt ${reconnectAttempts} to RabbitMQ in ${delay}ms`);

  setTimeout(() => {
    connectToRabbitMQ();
  }, delay);
};

const handleConnectionError = (error: Error, resolve?: ResolveCallback, reject?: RejectCallback) => {
  if (reject && reconnectAttempts === 0) {
    // Na inicialização, rejeitar a Promise se for a primeira tentativa
    reject(error);
    return;
  }

  scheduleReconnect();
};

export const getAMQP = (): amqp.Channel | null => {
  return amqpChannel;
};

export const initGlobalQueues = () => {
  logger.info('Initializing global queues');
  const rabbitmqConfig = configService.get<Rabbitmq>('RABBITMQ');
  const events = rabbitmqConfig.EVENTS;
  const prefixKey = rabbitmqConfig.PREFIX_KEY;
  const messageTtl = rabbitmqConfig.MESSAGE_TTL;
  const maxLength = rabbitmqConfig.MAX_LENGTH;
  const maxLengthBytes = rabbitmqConfig.MAX_LENGTH_BYTES;

  if (!events) {
    logger.warn('No events to initialize on AMQP');
    return;
  }

  const eventKeys = Object.keys(events);

  eventKeys.forEach((event) => {
    if (events[event] === false) {
      return;
    }

    const queueName =
      prefixKey !== ''
        ? `${prefixKey}.${event.replace(/_/g, '.').toLowerCase()}`
        : `${event.replace(/_/g, '.').toLowerCase()}`;

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
        'x-message-ttl': messageTtl,
        'x-max-length': maxLength,
        'x-max-length-bytes': maxLengthBytes,
        'x-overflow': 'reject-publish',
      },
    });

    amqp.bindQueue(queueName, exchangeName, event);
  });
};

export const initQueues = (instanceName: string, events: string[]) => {
  if (!events || !events.length) {
    return;
  }

  const rabbitmqConfig = configService.get<Rabbitmq>('RABBITMQ');
  const messageTtl = rabbitmqConfig.MESSAGE_TTL;
  const maxLength = rabbitmqConfig.MAX_LENGTH;
  const maxLengthBytes = rabbitmqConfig.MAX_LENGTH_BYTES;

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
        'x-message-ttl': messageTtl,
        'x-max-length': maxLength,
        'x-max-length-bytes': maxLengthBytes,
        'x-overflow': 'reject-publish',
      },
    });

    amqp.bindQueue(queueName, exchangeName, event);
  });
};

export const removeQueues = (instanceName: string, events: string[]) => {
  if (!events || !events.length) {
    return;
  }

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
