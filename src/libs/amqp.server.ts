import * as amqp from 'amqplib/callback_api';

import { configService, Rabbitmq } from '../config/env.config';
import { Logger } from '../config/logger.config';

// Create a logger instance specifically for AMQP-related logs.
const logger = new Logger('AMQP');

// Declare an AMQP channel, initially set to null.
let amqpChannel: amqp.Channel | null = null;

/**
 * Initializes the AMQP (Advanced Message Queuing Protocol) connection.
 * @returns {Promise<void>} A promise that resolves when the AMQP connection is established.
 */
export const initAMQP = () => {
  return new Promise<void>((resolve, reject) => {
    const uri = configService.get<Rabbitmq>('RABBITMQ').URI;

    // Connect to the RabbitMQ server.
    amqp.connect(uri, (error, connection) => {
      if (error) {
        reject(error);
        return;
      }

      // Create an AMQP channel for communication.
      connection.createChannel((channelError, channel) => {
        if (channelError) {
          reject(channelError);
          return;
        }

        const exchangeName = 'evolution_exchange';

        // Declare an exchange with topic routing.
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

/**
 * Get the initialized AMQP channel.
 * @returns {amqp.Channel | null} The initialized AMQP channel or null if not initialized.
 */
export const getAMQP = (): amqp.Channel | null => {
  return amqpChannel;
};

/**
 * Initializes queues for specified events.
 * @param {string} instanceName - The name of the instance.
 * @param {string[]} events - An array of event names.
 */
export const initQueues = (instanceName: string, events: string[]) => {
  if (!events || !events.length) return;

  // Transform event names into queue names.
  const queues = events.map((event) => {
    return `${event.replace(/_/g, '.').toLowerCase()}`;
  });

  queues.forEach((event) => {
    const amqp = getAMQP();
    const exchangeName = instanceName ?? 'evolution_exchange';

    // Assert the exchange with topic routing.
    amqp.assertExchange(exchangeName, 'topic', {
      durable: true,
      autoDelete: false,
    });

    const queueName = `${instanceName}.${event}`;

    // Assert a queue with quorum support.
    amqp.assertQueue(queueName, {
      durable: true,
      autoDelete: false,
      arguments: {
        'x-queue-type': 'quorum',
      },
    });

    // Bind the queue to the exchange with the corresponding event.
    amqp.bindQueue(queueName, exchangeName, event);
  });
};
