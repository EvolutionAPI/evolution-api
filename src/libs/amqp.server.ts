import * as amqp from 'amqplib/callback_api';

import { configService, Rabbitmq } from '../config/env.config';
import { Logger } from '../config/logger.config';

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
