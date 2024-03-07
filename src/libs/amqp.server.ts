import { Channel, connect } from 'amqplib/callback_api';

import { configService, HttpServer, Rabbitmq } from '../config/env.config';
import { Logger } from '../config/logger.config';
import { Events } from '../whatsapp/types/wa.types';

const logger = new Logger('AMQP');

const parseEvtName = (evt: string) => evt.replace(/_/g, '.').toLowerCase();

const globalQueues: { [key: string]: Events[] } = {
  contacts: [Events.CONTACTS_SET, Events.CONTACTS_UPDATE, Events.CONTACTS_UPSERT],
  messages: [
    Events.MESSAGES_DELETE,
    Events.MESSAGES_SET,
    Events.MESSAGES_UPDATE,
    Events.MESSAGES_UPSERT,
    Events.MESSAGING_HISTORY_SET,
    Events.SEND_MESSAGE,
  ],
  chats: [Events.CHATS_DELETE, Events.CHATS_SET, Events.CHATS_UPDATE, Events.CHATS_UPSERT],
  groups: [Events.GROUPS_UPDATE, Events.GROUPS_UPSERT, Events.GROUP_PARTICIPANTS_UPDATE],
  others: [], // All other events not included in the above categories
};

let amqpChannel: Channel | null = null;

export const initAMQP = () => {
  return new Promise<void>((resolve, reject) => {
    const rabbitConfig = configService.get<Rabbitmq>('RABBITMQ');
    connect(rabbitConfig.URI, (error, connection) => {
      if (error) {
        reject(error);
        return;
      }

      connection.createChannel((channelError, channel) => {
        if (channelError) {
          reject(channelError);
          return;
        }

        channel.assertExchange(rabbitConfig.EXCHANGE_NAME, 'topic', {
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

export const getAMQP = (): Channel | null => {
  return amqpChannel;
};

export const initQueues = (instanceName: string, events: string[]) => {
  if (!instanceName || !events || !events.length) return;
  const rabbitConfig = configService.get<Rabbitmq>('RABBITMQ');
  const TWO_DAYS_IN_MS = 2 * 24 * 60 * 60 * 1000;
  const amqp = getAMQP();

  let exchangeName = rabbitConfig.EXCHANGE_NAME;

  const receivedEvents = events.map(parseEvtName);
  if (rabbitConfig.MODE === 'isolated') {
    exchangeName = instanceName;

    receivedEvents.forEach((event) => {
      amqp.assertExchange(exchangeName, 'topic', {
        durable: true,
        autoDelete: false,
      });

      const queueName = event;
      amqp.assertQueue(queueName, {
        durable: true,
        autoDelete: false,
        messageTtl: TWO_DAYS_IN_MS,
        arguments: {
          'x-queue-type': 'quorum',
        },
      });

      amqp.bindQueue(queueName, exchangeName, event);
    });
  } else if (rabbitConfig.MODE === 'single') {
    amqp.assertExchange(exchangeName, 'topic', {
      durable: true,
      autoDelete: false,
    });

    const queueName = 'evolution';
    amqp.assertQueue(queueName, {
      durable: true,
      autoDelete: false,
      messageTtl: TWO_DAYS_IN_MS,
      arguments: {
        'x-queue-type': 'quorum',
      },
    });

    receivedEvents.forEach((event) => {
      amqp.bindQueue(queueName, exchangeName, event);
    });
  } else if (rabbitConfig.MODE === 'global') {
    const queues = Object.keys(globalQueues);

    const addQueues = queues.filter((evt) => {
      if (evt === 'others') {
        return receivedEvents.some(
          (e) =>
            !Object.values(globalQueues)
              .flat()
              .includes(e as Events),
        );
      }
      return globalQueues[evt].some((e) => receivedEvents.includes(e));
    });

    addQueues.forEach((event) => {
      amqp.assertExchange(exchangeName, 'topic', {
        durable: true,
        autoDelete: false,
      });

      const queueName = event;
      amqp.assertQueue(queueName, {
        durable: true,
        autoDelete: false,
        messageTtl: TWO_DAYS_IN_MS,
        arguments: {
          'x-queue-type': 'quorum',
        },
      });

      if (globalQueues[event].length === 0) {
        // Other events
        const otherEvents = Object.values(globalQueues).flat();
        for (const subEvent in Events) {
          const eventCode = Events[subEvent];
          if (otherEvents.includes(eventCode)) continue;
          if (!receivedEvents.includes(eventCode)) continue;
          amqp.bindQueue(queueName, exchangeName, eventCode);
        }
      } else {
        globalQueues[event].forEach((subEvent) => {
          amqp.bindQueue(queueName, exchangeName, subEvent);
        });
      }
    });
  } else {
    throw new Error('Invalid RabbitMQ mode');
  }
};

export const removeQueues = (instanceName: string, events: string[]) => {
  if (!events || !events.length) return;
  const rabbitConfig = configService.get<Rabbitmq>('RABBITMQ');
  let exchangeName = rabbitConfig.EXCHANGE_NAME;
  const amqp = getAMQP();

  const receivedEvents = events.map(parseEvtName);
  if (rabbitConfig.MODE === 'isolated') {
    exchangeName = instanceName;
    receivedEvents.forEach((event) => {
      amqp.assertExchange(exchangeName, 'topic', {
        durable: true,
        autoDelete: false,
      });

      const queueName = event;

      amqp.unbindQueue(queueName, exchangeName, event);
    });
    amqp.deleteExchange(instanceName);
  }
};

interface SendEventData {
  instanceName: string;
  wuid: string;
  event: string;
  apiKey?: string;
  data: any;
}

export const sendEventData = ({ data, event, wuid, apiKey, instanceName }: SendEventData) => {
  const rabbitConfig = configService.get<Rabbitmq>('RABBITMQ');
  let exchangeName = rabbitConfig.EXCHANGE_NAME;
  if (rabbitConfig.MODE === 'isolated') exchangeName = instanceName;

  amqpChannel.assertExchange(exchangeName, 'topic', {
    durable: true,
    autoDelete: false,
  });
  let queueName = event;
  if (rabbitConfig.MODE === 'single') {
    queueName = 'evolution';
  } else if (rabbitConfig.MODE === 'global') {
    let eventName = '';
    Object.keys(globalQueues).forEach((key) => {
      if (globalQueues[key].includes(event as Events)) {
        eventName = key;
      }
      if (eventName === '' && key === 'others') {
        eventName = key;
      }
    });
    queueName = eventName;
  }
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
