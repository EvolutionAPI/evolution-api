import * as amqp from 'amqplib/callback_api';

import { Logger } from '../config/logger.config';

const logger = new Logger('AMQP');

let amqpChannel: amqp.Channel | null = null;

export const initAMQP = () => {
  return new Promise<void>((resolve, reject) => {
    amqp.connect('amqp://admin:admin@localhost:5672', (error, connection) => {
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

        channel.assertExchange(exchangeName, 'topic', { durable: false });
        amqpChannel = channel;

        logger.log('Serviço do RabbitMQ inicializado com sucesso.');
        resolve();
      });
    });
  });
};

export const getAMQP = (): amqp.Channel | null => {
  return amqpChannel;
};
