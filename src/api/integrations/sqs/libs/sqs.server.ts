import { SQS } from '@aws-sdk/client-sqs';

import { configService, Sqs } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';

const logger = new Logger('SQS');

let sqs: SQS;

export const initSQS = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return new Promise<void>((resolve, reject) => {
    const awsConfig = configService.get<Sqs>('SQS');
    sqs = new SQS({
      credentials: {
        accessKeyId: awsConfig.ACCESS_KEY_ID,
        secretAccessKey: awsConfig.SECRET_ACCESS_KEY,
      },

      region: awsConfig.REGION,
    });

    logger.info('SQS initialized');
    resolve();
  });
};

export const getSQS = (): SQS => {
  return sqs;
};

export const initQueues = (instanceName: string, events: string[]) => {
  if (!events || !events.length) return;

  const queues = events.map((event) => {
    return `${event.replace(/_/g, '_').toLowerCase()}`;
  });

  const sqs = getSQS();

  queues.forEach((event) => {
    const queueName = `${instanceName}_${event}.fifo`;

    sqs.createQueue(
      {
        QueueName: queueName,
        Attributes: {
          FifoQueue: 'true',
        },
      },
      (err, data) => {
        if (err) {
          logger.error(`Error creating queue ${queueName}: ${err.message}`);
        } else {
          logger.info(`Queue ${queueName} created: ${data.QueueUrl}`);
        }
      },
    );
  });
};

export const removeQueues = (instanceName: string, events: string[]) => {
  if (!events || !events.length) return;

  const sqs = getSQS();

  const queues = events.map((event) => {
    return `${event.replace(/_/g, '_').toLowerCase()}`;
  });

  queues.forEach((event) => {
    const queueName = `${instanceName}_${event}.fifo`;

    sqs.getQueueUrl(
      {
        QueueName: queueName,
      },
      (err, data) => {
        if (err) {
          logger.error(`Error getting queue URL for ${queueName}: ${err.message}`);
        } else {
          const queueUrl = data.QueueUrl;

          sqs.deleteQueue(
            {
              QueueUrl: queueUrl,
            },
            (deleteErr) => {
              if (deleteErr) {
                logger.error(`Error deleting queue ${queueName}: ${deleteErr.message}`);
              } else {
                logger.info(`Queue ${queueName} deleted`);
              }
            },
          );
        }
      },
    );
  });
};
