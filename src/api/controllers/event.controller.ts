import { PrismaRepository } from '@api/repository/repository.service';
import { websocketController } from '@api/server.module';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Server } from 'http';

export class EventController {
  public prismaRepository: PrismaRepository;
  public waMonitor: WAMonitoringService;

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    this.prisma = prismaRepository;
    this.monitor = waMonitor;
  }

  public set prisma(prisma: PrismaRepository) {
    this.prismaRepository = prisma;
  }

  public get prisma() {
    return this.prismaRepository;
  }

  public set monitor(waMonitor: WAMonitoringService) {
    this.waMonitor = waMonitor;
  }

  public get monitor() {
    return this.waMonitor;
  }

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

  public init(httpServer: Server): void {
    // websocket
    websocketController.init(httpServer);
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
    // websocket
    await websocketController.emit({
      instanceName,
      origin,
      event,
      data,
    });
  }

  public async set(instanceName: string, data: any): Promise<any> {
    // websocket
    await websocketController.set(instanceName, data);
  }

  public async get(instanceName: string): Promise<any> {
    // websocket
    await websocketController.get(instanceName);
  }
}
