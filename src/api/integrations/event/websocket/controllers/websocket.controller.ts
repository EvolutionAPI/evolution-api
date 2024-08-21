import { WebsocketDto } from '@api/integrations/event/websocket/dto/websocket.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { wa } from '@api/types/wa.types';
import { configService, Cors, Log, Websocket } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { NotFoundException } from '@exceptions';
import { Server } from 'http';
import { Server as SocketIO } from 'socket.io';

import { EventController } from '../../event.controller';

export class WebsocketController extends EventController {
  private io: SocketIO;
  private corsConfig: Array<any>;
  private readonly logger = new Logger(WebsocketController.name);

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    super(prismaRepository, waMonitor);
    this.cors = configService.get<Cors>('CORS').ORIGIN;
  }

  public init(httpServer: Server): void {
    if (!configService.get<Websocket>('WEBSOCKET')?.ENABLED) {
      return;
    }

    this.socket = new SocketIO(httpServer, {
      cors: {
        origin: this.cors,
      },
    });

    this.socket.on('connection', (socket) => {
      this.logger.info('User connected');

      socket.on('disconnect', () => {
        this.logger.info('User disconnected');
      });
    });

    this.logger.info('Socket.io initialized');
  }

  private set cors(cors: Array<any>) {
    this.corsConfig = cors;
  }

  private get cors(): string | Array<any> {
    return this.corsConfig?.includes('*') ? '*' : this.corsConfig;
  }

  private set socket(socket: SocketIO) {
    this.io = socket;
  }

  public get socket(): SocketIO {
    return this.io;
  }

  public async set(instanceName: string, data: WebsocketDto): Promise<wa.LocalWebsocket> {
    if (!data.enabled) {
      data.events = [];
    } else {
      if (0 === data.events.length) {
        data.events = this.events;
      }
    }

    try {
      await this.get(instanceName);

      return this.prisma.websocket.update({
        where: {
          instanceId: this.monitor.waInstances[instanceName].instanceId,
        },
        data,
      });
    } catch (err) {
      return this.prisma.websocket.create({
        data: {
          enabled: data.enabled,
          events: data.events,
          instanceId: this.monitor.waInstances[instanceName].instanceId,
        },
      });
    }
  }

  public async get(instanceName: string): Promise<wa.LocalWebsocket> {
    if (undefined === this.monitor.waInstances[instanceName]) {
      throw new NotFoundException('Instance not found');
    }

    const data = await this.prisma.websocket.findUnique({
      where: {
        instanceId: this.monitor.waInstances[instanceName].instanceId,
      },
    });

    if (!data) {
      return null;
    }

    return data;
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
  }: {
    instanceName: string;
    origin: string;
    event: string;
    data: Object;
    serverUrl: string;
    dateTime: string;
    sender: string;
    apiKey?: string;
  }): Promise<void> {
    if (!configService.get<Websocket>('WEBSOCKET')?.ENABLED) {
      return;
    }

    const configEv = event.replace(/[.-]/gm, '_').toUpperCase();
    const logEnabled = configService.get<Log>('LOG').LEVEL.includes('WEBSOCKET');
    const message = {
      event,
      instance: instanceName,
      data,
      server_url: serverUrl,
      date_time: dateTime,
      sender,
      apikey: apiKey,
    };

    if (configService.get<Websocket>('WEBSOCKET')?.GLOBAL_EVENTS) {
      this.socket.emit(event, message);

      if (logEnabled) {
        this.logger.log({
          local: `${origin}.sendData-WebsocketGlobal`,
          ...message,
        });
      }
    }

    try {
      const instanceSocket = await this.get(instanceName);

      if (!instanceSocket?.enabled) {
        return;
      }

      if (Array.isArray(instanceSocket?.events) && instanceSocket?.events.includes(configEv)) {
        this.socket.of(`/${instanceName}`).emit(event, message);

        if (logEnabled) {
          this.logger.log({
            local: `${origin}.sendData-Websocket`,
            ...message,
          });
        }
      }
    } catch (err) {
      if (logEnabled) {
        this.logger.log(err);
      }
    }
  }
}
