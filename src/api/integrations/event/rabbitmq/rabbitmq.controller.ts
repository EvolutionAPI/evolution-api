import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { configService, Log, Rabbitmq } from '@config/env.config';
import { Logger } from '@config/logger.config';
import * as amqp from 'amqplib/callback_api';

import { EmitData, EventController, EventControllerInterface } from '../event.controller';

export class RabbitmqController extends EventController implements EventControllerInterface {
  public amqpChannel: amqp.Channel | null = null;
  private amqpConnection: amqp.Connection | null = null;
  private readonly logger = new Logger('RabbitmqController');
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000; // 5 seconds
  private isReconnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' = 'disconnected';
  private isShuttingDown = false;

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    super(prismaRepository, waMonitor, configService.get<Rabbitmq>('RABBITMQ')?.ENABLED, 'rabbitmq');
  }

  public async init(): Promise<void> {
    if (!this.status) {
      return;
    }

    await this.connect();
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down RabbitMQ controller...');
    this.isShuttingDown = true;
    
    // Clear any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close channel and connection gracefully
    await this.closeConnection();
    this.logger.info('RabbitMQ controller shutdown complete');
  }

  private async closeConnection(): Promise<void> {
    try {
      if (this.amqpChannel) {
        await new Promise<void>((resolve) => {
          this.amqpChannel?.close((err) => {
            if (err) {
              this.logger.warn(`Error closing channel: ${err.message}`);
            }
            resolve();
          });
        });
        this.amqpChannel = null;
      }

      if (this.amqpConnection) {
        await new Promise<void>((resolve) => {
          this.amqpConnection?.close((err) => {
            if (err) {
              this.logger.warn(`Error closing connection: ${err.message}`);
            }
            resolve();
          });
        });
        this.amqpConnection = null;
      }
    } catch (error) {
      this.logger.error({
        local: 'RabbitmqController.closeConnection',
        message: 'Error during connection cleanup',
        error: error.message || error,
      });
    }
  }

  public getConnectionStatus(): string {
    return this.connectionStatus;
  }

  public isConnected(): boolean {
    return this.connectionStatus === 'connected' && this.amqpChannel !== null && this.amqpConnection !== null;
  }

  public async forceReconnect(): Promise<void> {
    this.logger.info('Force reconnect requested');
    
    // Reset reconnect attempts for forced reconnect
    this.reconnectAttempts = 0;
    
    // Close existing connections
    await this.closeConnection();
    
    // Clear any pending reconnect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.isReconnecting = false;
    
    // Attempt immediate reconnection
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.connectionStatus = this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';

    return new Promise<void>((resolve, reject) => {
      const uri = configService.get<Rabbitmq>('RABBITMQ').URI;
      const frameMax = configService.get<Rabbitmq>('RABBITMQ').FRAME_MAX;
      const rabbitmqExchangeName = configService.get<Rabbitmq>('RABBITMQ').EXCHANGE_NAME;

      const url = new URL(uri);
      const connectionOptions = {
        protocol: url.protocol.slice(0, -1),
        hostname: url.hostname,
        port: url.port || 5672,
        username: url.username || 'guest',
        password: url.password || 'guest',
        vhost: url.pathname.slice(1) || '/',
        frameMax: frameMax,
        heartbeat: 30, // Add heartbeat of 30 seconds
      };

      amqp.connect(connectionOptions, (error, connection) => {
        if (error) {
          this.connectionStatus = 'disconnected';
          this.logger.error({
            local: 'RabbitmqController.connect',
            message: 'Failed to connect to RabbitMQ',
            error: error.message || error,
          });
          reject(error);
          return;
        }

        // Connection event handlers
        connection.on('error', (err) => {
          this.logger.error({
            local: 'RabbitmqController.connectionError',
            message: 'RabbitMQ connection error',
            error: err.message || err,
          });
          this.handleConnectionLoss('connection_error', err);
        });

        connection.on('close', () => {
          this.logger.warn('RabbitMQ connection closed');
          this.handleConnectionLoss('connection_closed');
        });

        connection.on('blocked', (reason) => {
          this.logger.warn(`RabbitMQ connection blocked: ${reason}`);
        });

        connection.on('unblocked', () => {
          this.logger.info('RabbitMQ connection unblocked');
        });

        connection.createChannel((channelError, channel) => {
          if (channelError) {
            this.connectionStatus = 'disconnected';
            this.logger.error({
              local: 'RabbitmqController.createChannel',
              message: 'Failed to create RabbitMQ channel',
              error: channelError.message || channelError,
            });
            reject(channelError);
            return;
          }

          // Channel event handlers
          channel.on('error', (err) => {
            this.logger.error({
              local: 'RabbitmqController.channelError',
              message: 'RabbitMQ channel error',
              error: err.message || err,
            });
            this.handleConnectionLoss('channel_error', err);
          });

          channel.on('close', () => {
            this.logger.warn('RabbitMQ channel closed');
            this.handleConnectionLoss('channel_closed');
          });

          channel.on('return', (msg) => {
            this.logger.warn('RabbitMQ message returned' + JSON.stringify({
              exchange: msg.fields.exchange,
              routingKey: msg.fields.routingKey,
              replyCode: msg.fields.replyCode,
              replyText: msg.fields.replyText,
            }));
          });

          const exchangeName = rabbitmqExchangeName;

          channel.assertExchange(exchangeName, 'topic', {
            durable: true,
            autoDelete: false,
          }, (exchangeError) => {
            if (exchangeError) {
              this.connectionStatus = 'disconnected';
              this.logger.error({
                local: 'RabbitmqController.assertExchange',
                message: 'Failed to assert exchange',
                error: exchangeError.message || exchangeError,
              });
              reject(exchangeError);
              return;
            }

            this.amqpConnection = connection;
            this.amqpChannel = channel;
            this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
            this.isReconnecting = false;
            this.connectionStatus = 'connected';

            this.logger.info('AMQP initialized successfully');
            resolve();
          });
        });
      });
    })
      .then(() => {
        if (configService.get<Rabbitmq>('RABBITMQ')?.GLOBAL_ENABLED) {
          return this.initGlobalQueues();
        }
      })
      .catch((error) => {
        this.connectionStatus = 'disconnected';
        this.logger.error({
          local: 'RabbitmqController.init',
          message: 'Failed to initialize AMQP',
          error: error.message || error,
        });
        this.scheduleReconnect();
        throw error;
      });
  }

  private handleConnectionLoss(reason?: string, error?: any): void {
    if (this.isReconnecting || this.isShuttingDown) {
      return; // Already attempting to reconnect or shutting down
    }

    this.logger.warn(`Connection lost due to: ${reason || 'unknown reason'}` + JSON.stringify(error ? { error: error.message || error } : {}));
    
    this.connectionStatus = 'disconnected';
    this.amqpChannel = null;
    this.amqpConnection = null;
    
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        `Maximum reconnect attempts (${this.maxReconnectAttempts}) reached. Stopping reconnection attempts.`,
      );
      this.connectionStatus = 'disconnected';
      return;
    }

    if (this.isReconnecting) {
      return; // Already scheduled
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = this.reconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5)); // Exponential backoff with max delay

    this.logger.info(
      `Scheduling RabbitMQ reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`,
    );

    this.reconnectTimer = setTimeout(async () => {
      if (this.isShuttingDown) {
        return;
      }

      try {
        this.logger.info(
          `Attempting to reconnect to RabbitMQ (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
        );
        await this.connect();
        this.logger.info('Successfully reconnected to RabbitMQ');
      } catch (error) {
        this.logger.error({
          local: 'RabbitmqController.scheduleReconnect',
          message: `Reconnection attempt ${this.reconnectAttempts} failed`,
          error: error.message || error,
        });
        this.isReconnecting = false;
        this.scheduleReconnect();
      } finally {
        this.reconnectTimer = null;
      }
    }, delay);
  }

  private set channel(channel: amqp.Channel) {
    this.amqpChannel = channel;
  }

  public get channel(): amqp.Channel {
    return this.amqpChannel;
  }

  private async ensureConnection(): Promise<boolean> {
    if (!this.amqpChannel || !this.isConnected()) {
      this.logger.warn('AMQP channel is not available, attempting to reconnect...');
      if (!this.isReconnecting && !this.isShuttingDown) {
        this.scheduleReconnect();
      }
      return false;
    }
    return true;
  }

  public async waitForConnection(timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (this.isConnected()) {
        return true;
      }
      
      if (this.isShuttingDown) {
        return false;
      }
      
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
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

    if (!(await this.ensureConnection())) {
      this.logger.warn(`Failed to emit event ${event} for instance ${instanceName}: No AMQP connection`);
      return;
    }

    const instanceRabbitmq = await this.get(instanceName);
    const rabbitmqLocal = instanceRabbitmq?.events;
    const rabbitmqGlobal = configService.get<Rabbitmq>('RABBITMQ').GLOBAL_ENABLED;
    const rabbitmqEvents = configService.get<Rabbitmq>('RABBITMQ').EVENTS;
    const prefixKey = configService.get<Rabbitmq>('RABBITMQ').PREFIX_KEY;
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
        await this.publishMessage(exchangeName, event, message, instanceName, origin, logEnabled, 'local');
      }
    }

    if (rabbitmqGlobal && rabbitmqEvents[we] && this.amqpChannel) {
      const exchangeName = rabbitmqExchangeName;
      await this.publishMessage(exchangeName, event, message, instanceName, origin, logEnabled, 'global');
    }
  }

  private async publishMessage(
    exchangeName: string,
    event: string,
    message: any,
    instanceName: string,
    origin: string,
    logEnabled: boolean,
    type: 'local' | 'global'
  ): Promise<void> {
    let retry = 0;
    const maxRetries = 3;

    while (retry < maxRetries) {
      try {
        if (!(await this.ensureConnection())) {
          throw new Error('No AMQP connection available');
        }

        await this.amqpChannel.assertExchange(exchangeName, 'topic', {
          durable: true,
          autoDelete: false,
        });

        let queueName: string;
        let routingKey: string;

        if (type === 'local') {
          const eventName = event.replace(/_/g, '.').toLowerCase();
          queueName = `${instanceName}.${eventName}`;
          routingKey = eventName;
        } else {
          const prefixKey = configService.get<Rabbitmq>('RABBITMQ').PREFIX_KEY;
          queueName = prefixKey
            ? `${prefixKey}.${event.replace(/_/g, '.').toLowerCase()}`
            : event.replace(/_/g, '.').toLowerCase();
          routingKey = event;
        }

        await this.amqpChannel.assertQueue(queueName, {
          durable: true,
          autoDelete: false,
          arguments: {
            'x-queue-type': 'quorum',
          },
        });

        await this.amqpChannel.bindQueue(queueName, exchangeName, routingKey);

        const published = await new Promise<boolean>((resolve) => {
          const success = this.amqpChannel.publish(
            exchangeName,
            routingKey,
            Buffer.from(JSON.stringify(message)),
            { persistent: true },
            (err) => {
              if (err) {
                resolve(false);
              } else {
                resolve(true);
              }
            }
          );
          
          if (!success) {
            resolve(false);
          }
        });

        if (!published) {
          throw new Error('Failed to publish message - channel write buffer full');
        }

        if (logEnabled) {
          const logData = {
            local: `${origin}.sendData-RabbitMQ${type === 'global' ? '-Global' : ''}`,
            ...message,
          };

          this.logger.log(logData);
        }

        break; // Success, exit retry loop
      } catch (error) {
        this.logger.error({
          local: 'RabbitmqController.publishMessage',
          message: `Error publishing ${type} RabbitMQ message (attempt ${retry + 1}/${maxRetries})`,
          error: error.message || error,
        });
        retry++;
        
        if (retry >= maxRetries) {
          this.handleConnectionLoss('publish_error', error);
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retry));
      }
    }
  }

  private async initGlobalQueues(): Promise<void> {
    this.logger.info('Initializing global queues');

    if (!(await this.ensureConnection())) {
      this.logger.error('Cannot initialize global queues: No AMQP connection');
      return;
    }

    const rabbitmqExchangeName = configService.get<Rabbitmq>('RABBITMQ').EXCHANGE_NAME;
    const events = configService.get<Rabbitmq>('RABBITMQ').EVENTS;
    const prefixKey = configService.get<Rabbitmq>('RABBITMQ').PREFIX_KEY;

    if (!events) {
      this.logger.warn('No events to initialize on AMQP');
      return;
    }

    const eventKeys = Object.keys(events);

    for (const event of eventKeys) {
      if (events[event] === false) continue;

      try {
        const queueName =
          prefixKey !== ''
            ? `${prefixKey}.${event.replace(/_/g, '.').toLowerCase()}`
            : `${event.replace(/_/g, '.').toLowerCase()}`;
        const exchangeName = rabbitmqExchangeName;

        await this.amqpChannel.assertExchange(exchangeName, 'topic', {
          durable: true,
          autoDelete: false,
        });

        await this.amqpChannel.assertQueue(queueName, {
          durable: true,
          autoDelete: false,
          arguments: {
            'x-queue-type': 'quorum',
          },
        });

        await this.amqpChannel.bindQueue(queueName, exchangeName, event);

        this.logger.info(`Global queue initialized: ${queueName}`);
      } catch (error) {
        this.logger.error({
          local: 'RabbitmqController.initGlobalQueues',
          message: `Failed to initialize global queue for event ${event}`,
          error: error.message || error,
        });
        this.handleConnectionLoss('queue_init_error', error);
        break;
      }
    }
  }
}