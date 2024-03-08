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

        const exchangeName = rabbitConfig.EXCHANGE_NAME ?? 'evolution_exchange';

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

export const getAMQP = (): Channel | null => {
  return amqpChannel;
};

export const initQueues = (instanceName: string, events: string[]) => {
  if (!instanceName || !events || !events.length) return;
  const rabbitConfig = configService.get<Rabbitmq>('RABBITMQ');
  const TWO_DAYS_IN_MS = 2 * 24 * 60 * 60 * 1000;
  const amqp = getAMQP();

  const rabbitMode = rabbitConfig.MODE || 'isolated';
  let exchangeName = rabbitConfig.EXCHANGE_NAME ?? 'evolution_exchange';

  const receivedEvents = events.map(parseEvtName);
  if (rabbitMode === 'isolated') {
    exchangeName = instanceName ?? 'evolution_exchange';

    amqp.assertExchange(exchangeName, 'topic', {
      durable: true,
      autoDelete: false,
    });

    receivedEvents.forEach((event) => {
      const queueName = `${instanceName}.${event}`;
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
  } else if (rabbitMode === 'single') {
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
  } else if (rabbitMode === 'global') {
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

  const rabbitMode = rabbitConfig.MODE || 'isolated';
  let exchangeName = rabbitConfig.EXCHANGE_NAME ?? 'evolution_exchange';
  const amqp = getAMQP();

  const receivedEvents = events.map(parseEvtName);
  if (rabbitMode === 'isolated') {
    exchangeName = instanceName;
    receivedEvents.forEach((event) => {
      amqp.assertExchange(exchangeName, 'topic', {
        durable: true,
        autoDelete: false,
      });

      const queueName = `${instanceName}.${event}`;
      amqp.deleteQueue(queueName);
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
  const rabbitMode = rabbitConfig.MODE || 'isolated';
  let exchangeName = rabbitConfig.EXCHANGE_NAME ?? 'evolution_exchange';
  if (rabbitMode === 'isolated') exchangeName = instanceName ?? 'evolution_exchange';

  console.log('exchangeName: ', exchangeName);
  console.log('rabbitMode: ', rabbitMode);

  amqpChannel.assertExchange(exchangeName, 'topic', {
    durable: true,
    autoDelete: false,
  });

  let queueName = event;

  if (rabbitMode === 'single') {
    queueName = 'evolution';
  } else if (rabbitMode === 'global') {
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
  } else if (rabbitMode === 'isolated') {
    queueName = `${instanceName}.${event}`;
  }

  amqpChannel.assertQueue(queueName, {
    durable: true,
    autoDelete: false,
    arguments: { 'x-queue-type': 'quorum' },
  });

  console.log('envia na fila: ', queueName, exchangeName, event);

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
