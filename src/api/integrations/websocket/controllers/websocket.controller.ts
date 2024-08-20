import { WebsocketDto } from '@api/integrations/websocket/dto/websocket.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { wa } from '@api/types/wa.types';
import { configService, Cors, HttpServer, Log, Websocket } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { NotFoundException } from '@exceptions';
import { Server } from 'http';
import { Server as SocketIO } from 'socket.io';

export class WebsocketController {
  private io: SocketIO;
  private prismaRepository: PrismaRepository;
  private waMonitor: WAMonitoringService;
  private corsConfig: Array<any>;
  private readonly logger = new Logger('SocketStartupService');
  public readonly events = [
    'APPLICATION_STARTUP',
    'QRCODE_UPDATED',
    'MESSAGES_SET',
    'MESSAGES_UPSERT',
    'MESSAGES_EDITED',
    'MESSAGES_UPDATE',
    'MESSAGES_DELETE',
    'SEND_MESSAGE',
    'CONTACTS_SET',
    'CONTACTS_UPSERT',
    'CONTACTS_UPDATE',
    'PRESENCE_UPDATE',
    'CHATS_SET',
    'CHATS_UPSERT',
    'CHATS_UPDATE',
    'CHATS_DELETE',
    'GROUPS_UPSERT',
    'GROUP_UPDATE',
    'GROUP_PARTICIPANTS_UPDATE',
    'CONNECTION_UPDATE',
    'LABELS_EDIT',
    'LABELS_ASSOCIATION',
    'CALL',
    'TYPEBOT_START',
    'TYPEBOT_CHANGE_STATUS',
    'REMOVE_INSTANCE',
    'LOGOUT_INSTANCE',
  ];

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    this.prisma = prismaRepository;
    this.monitor = waMonitor;
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

  private set prisma(prisma: PrismaRepository) {
    this.prismaRepository = prisma;
  }

  private get prisma() {
    return this.prismaRepository;
  }

  private set monitor(waMonitor: WAMonitoringService) {
    this.waMonitor = waMonitor;
  }

  private get monitor() {
    return this.waMonitor;
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
      throw new NotFoundException('Websocket not found');
    }

    return data;
  }

  public async emit({
    instanceName,
    origin,
    event,
    data,
  }: {
    instanceName: string;
    origin: string;
    event: string;
    data: Object;
  }): Promise<void> {
    if (!configService.get<Websocket>('WEBSOCKET')?.ENABLED) {
      return;
    }

    const configEv = event.replace(/[.-]/gm, '_').toUpperCase();
    const logEnabled = configService.get<Log>('LOG').LEVEL.includes('WEBSOCKET');
    const serverUrl = configService.get<HttpServer>('SERVER').URL;
    const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString();
    const message = {
      event,
      instanceName,
      data,
      serverUrl,
      date,
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

      if (!instanceSocket.enabled) {
        return;
      }

      if (Array.isArray(instanceSocket.events) && instanceSocket.events.includes(configEv)) {
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
