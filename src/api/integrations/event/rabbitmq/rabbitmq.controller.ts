import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { configService, Log, Rabbitmq } from '@config/env.config';
import { Logger } from '@config/logger.config';
import * as amqp from 'amqplib/callback_api';

import { EmitData, EventController, EventControllerInterface } from '../event.controller';

export class RabbitmqController extends EventController implements EventControllerInterface {
  public amqpChannel: amqp.Channel | null = null;
  private amqpConnection: amqp.Connection | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt: number = 0;
  private maxReconnectDelay: number = 300000; // 5 minutos máximo
  private baseReconnectDelay: number = 1000; // 1 segundo inicial
  private isReconnecting: boolean = false;
  private isShuttingDown: boolean = false;
  private readonly logger = new Logger('RabbitmqController');

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    super(prismaRepository, waMonitor, configService.get<Rabbitmq>('RABBITMQ')?.ENABLED, 'rabbitmq');
  }

  public async init(): Promise<void> {
    if (!this.status) {
      return;
    }

    return this.connect();
  }

  private async connect(): Promise<void> {
    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;

    try {
      const uri = configService.get<Rabbitmq>('RABBITMQ').URI;
      const frameMax = configService.get<Rabbitmq>('RABBITMQ').FRAME_MAX;
      const rabbitmqExchangeName = configService.get<Rabbitmq>('RABBITMQ').EXCHANGE_NAME;

      this.logger.info(`Tentativa de conexão RabbitMQ #${this.reconnectAttempt + 1}...`);

      const url = new URL(uri);
      const connectionOptions = {
        protocol: url.protocol.slice(0, -1),
        hostname: url.hostname,
        port: url.port || 5672,
        username: url.username || 'guest',
        password: url.password || 'guest',
        vhost: url.pathname.slice(1) || '/',
        frameMax: frameMax,
        reconnect: true,
        reconnectBackoffStrategy: 'linear',
        reconnectExponentialLimit: 120000,
        reconnectTimeInSeconds: 5,
      };
      

      await new Promise<void>((resolve, reject) => {
        amqp.connect(connectionOptions, (error, connection) => {
          if (error) {
            this.logger.error(`Failed to connect to RabbitMQ (attempt #${this.reconnectAttempt + 1}): ${error.message}`);
            reject(error);
            return;
          }

          this.amqpConnection = connection;
          this.reconnectAttempt = 0; // Reset counter on successful connection
          this.isReconnecting = false;

          connection.on('error', (err) => {
            this.logger.error(`RabbitMQ connection error: ${err.message}`);
            this.handleConnectionError();
          });

          connection.on('close', () => {
            this.logger.warn('RabbitMQ connection closed, attempting reconnection...');
            this.amqpConnection = null;
            this.amqpChannel = null;
            this.scheduleReconnect();
          });

          connection.createChannel((channelError, channel) => {
            if (channelError) {
              this.logger.error(`Failed to create RabbitMQ channel: ${channelError.message}`);
              reject(channelError);
              return;
            }

            channel.on('error', (err) => {
              this.logger.error(`RabbitMQ channel error: ${err.message}`);
              this.handleChannelError();
            });

            channel.on('close', () => {
              this.logger.warn('RabbitMQ channel closed');
              this.amqpChannel = null;
            });

            const exchangeName = rabbitmqExchangeName;

            channel.assertExchange(exchangeName, 'topic', {
              durable: true,
              autoDelete: false,
            });

            // Enable publisher confirms
            channel.confirmSelect();

            this.amqpChannel = channel;

            this.logger.info(`✅ RabbitMQ conectado com sucesso após ${this.reconnectAttempt > 0 ? this.reconnectAttempt + ' tentativas' : '1 tentativa'}`);

            resolve();
          });
        });
      });

      if (configService.get<Rabbitmq>('RABBITMQ')?.GLOBAL_ENABLED) {
        await this.initGlobalQueues();
      }
    } catch (error) {
      this.isReconnecting = false;
      this.logger.error(`Error initializing RabbitMQ (attempt #${this.reconnectAttempt + 1}): ${error.message}`);
      this.scheduleReconnect();
    }
  }

  private handleConnectionError(): void {
    this.amqpConnection = null;
    this.amqpChannel = null;
    this.scheduleReconnect();
  }

  private handleChannelError(): void {
    this.amqpChannel = null;

    if (this.amqpConnection) {
      this.amqpConnection.createChannel((channelError, channel) => {
        if (channelError) {
          this.logger.error(`Failed to recreate channel: ${channelError.message}`);
          return;
        }

        channel.on('error', (err) => {
          this.logger.error(`RabbitMQ channel error: ${err.message}`);
          this.handleChannelError();
        });

        channel.on('close', () => {
          this.logger.warn('RabbitMQ channel closed');
          this.amqpChannel = null;
        });

        // Enable publisher confirms on recreated channel
        channel.confirmSelect();
        
        this.amqpChannel = channel;
        this.logger.info('RabbitMQ channel recreated successfully');
      });
    }
  }

  private scheduleReconnect(): void {
    // Se está em processo de shutdown, não tentar reconectar
    if (this.isShuttingDown) {
      this.logger.info('🛑 Sistema em shutdown, parando tentativas de reconexão');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempt++;
    
    // Backoff exponencial: 1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, até max 5min
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempt - 1),
      this.maxReconnectDelay
    );

    this.logger.info(`⏰ Agendando reconexão RabbitMQ em ${delay/1000}s (tentativa #${this.reconnectAttempt})...`);

    this.reconnectTimer = setTimeout(() => {
      // Verificar novamente se não está em shutdown
      if (this.isShuttingDown) {
        this.logger.info('🛑 Sistema em shutdown durante reconnect timer');
        return;
      }

      this.logger.info(`🔄 Tentando reconectar ao RabbitMQ (tentativa #${this.reconnectAttempt})...`);
      this.connect().catch((error) => {
        if (this.isShuttingDown) {
          this.logger.info('🛑 Sistema em shutdown, interrompendo reconexão');
          return;
        }
        
        this.logger.error(`❌ Falha na reconexão #${this.reconnectAttempt}: ${error.message}`);
        // NUNCA desistir - sempre tentar novamente (exceto se em shutdown)
        this.logger.info(`💪 NUNCA desisto! Reagendando próxima tentativa...`);
        this.scheduleReconnect();
      });
    }, delay);
  }

  public async shutdown(): Promise<void> {
    this.logger.info('🛑 Iniciando shutdown do RabbitMQ Controller...');
    
    // Marcar como em processo de shutdown para parar tentativas de reconexão
    this.isShuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.logger.info('⏹️ Timer de reconexão cancelado');
    }

    if (this.amqpChannel) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.amqpChannel.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        this.amqpChannel = null;
        this.logger.info('✅ RabbitMQ channel fechado graciosamente');
      } catch (error) {
        this.logger.error(`❌ Erro ao fechar RabbitMQ channel: ${error.message}`);
      }
    }

    if (this.amqpConnection) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.amqpConnection.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        this.amqpConnection = null;
        this.logger.info('✅ RabbitMQ connection fechada graciosamente');
      } catch (error) {
        this.logger.error(`❌ Erro ao fechar RabbitMQ connection: ${error.message}`);
      }
    }

    this.logger.info('✅ Shutdown do RabbitMQ Controller concluído');
  }

  private set channel(channel: amqp.Channel) {
    this.amqpChannel = channel;
  }

  public get channel(): amqp.Channel {
    return this.amqpChannel;
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

        let retry = 0;

        while (true) {
          try {
            if (!this.amqpChannel) {
              this.logger.warn('RabbitMQ channel not available, waiting for reconnection...');
              await new Promise((resolve) => setTimeout(resolve, 1000));
              continue;
            }

            await this.amqpChannel.assertExchange(exchangeName, 'topic', {
              durable: true,
              autoDelete: false,
            });

            const eventName = event.replace(/_/g, '.').toLowerCase();

            const queueName = `${instanceName}.${eventName}`;

            await this.amqpChannel.assertQueue(queueName, {
              durable: true,
              autoDelete: false,
              arguments: {
                'x-queue-type': 'quorum',
              },
            });

            await this.amqpChannel.bindQueue(queueName, exchangeName, eventName);

            // Publish with confirmation
            const published = this.amqpChannel.publish(
              exchangeName, 
              event, 
              Buffer.from(JSON.stringify(message)),
              { persistent: true }
            );

            if (!published) {
              throw new Error('Message could not be published (buffer full)');
            }

            // Wait for confirmation
            await new Promise<void>((resolve, reject) => {
              this.amqpChannel.waitForConfirms((err) => {
                if (err) {
                  reject(new Error(`Message confirmation failed: ${err.message}`));
                } else {
                  resolve();
                }
              });
            });

            if (logEnabled) {
              const logData = {
                local: `${origin}.sendData-RabbitMQ`,
                ...message,
              };

              this.logger.log(logData);
            }

            break;
          } catch (error) {
            retry++;
            this.logger.error(`RabbitMQ publish attempt ${retry} failed: ${error.message}`);

            if (!this.amqpChannel) {
              this.scheduleReconnect();
            }
            
            await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * retry, 30000)));
          }
        }
      }
    }

    if (rabbitmqGlobal && rabbitmqEvents[we] && this.amqpChannel) {
      const exchangeName = rabbitmqExchangeName;

      let retry = 0;

      while (true) {
        try {
          if (!this.amqpChannel) {
            this.logger.warn('RabbitMQ channel not available, waiting for reconnection...');
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }

          await this.amqpChannel.assertExchange(exchangeName, 'topic', {
            durable: true,
            autoDelete: false,
          });

          const queueName = prefixKey
            ? `${prefixKey}.${event.replace(/_/g, '.').toLowerCase()}`
            : event.replace(/_/g, '.').toLowerCase();

          await this.amqpChannel.assertQueue(queueName, {
            durable: true,
            autoDelete: false,
            arguments: {
              'x-queue-type': 'quorum',
            },
          });

          await this.amqpChannel.bindQueue(queueName, exchangeName, event);

          // Publish with confirmation
          const published = this.amqpChannel.publish(
            exchangeName, 
            event, 
            Buffer.from(JSON.stringify(message)),
            { persistent: true }
          );

          if (!published) {
            throw new Error('Global message could not be published (buffer full)');
          }

          // Wait for confirmation
          await new Promise<void>((resolve, reject) => {
            this.amqpChannel.waitForConfirms((err) => {
              if (err) {
                reject(new Error(`Global message confirmation failed: ${err.message}`));
              } else {
                resolve();
              }
            });
          });

          if (logEnabled) {
            const logData = {
              local: `${origin}.sendData-RabbitMQ-Global`,
              ...message,
            };

            this.logger.log(logData);
          }

          break;
        } catch (error) {
          retry++;
          this.logger.error(`RabbitMQ global publish attempt ${retry} failed: ${error.message}`);

          if (!this.amqpChannel) {
            this.scheduleReconnect();
          }
          
          await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * retry, 30000)));
        }
      }
    }
  }

  private async initGlobalQueues(): Promise<void> {
    this.logger.info('Initializing global queues');

    const rabbitmqExchangeName = configService.get<Rabbitmq>('RABBITMQ').EXCHANGE_NAME;
    const events = configService.get<Rabbitmq>('RABBITMQ').EVENTS;
    const prefixKey = configService.get<Rabbitmq>('RABBITMQ').PREFIX_KEY;

    if (!events) {
      this.logger.warn('No events to initialize on AMQP');
      return;
    }

    if (!this.amqpChannel) {
      this.logger.error('Cannot initialize global queues: RabbitMQ channel not available');
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

        this.logger.debug(`Global queue ${queueName} initialized successfully`);
      } catch (error) {
        this.logger.error(`Failed to initialize global queue for event ${event}: ${error.message}`);
      }
    }

    this.logger.info('Global queues initialization completed');
  }
}