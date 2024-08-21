import { PrismaRepository } from '@api/repository/repository.service';
import { rabbitmqController, sqsController, webhookController, websocketController } from '@api/server.module';
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

    // rabbitmq
    rabbitmqController.init();

    // sqs
    sqsController.init();
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
    local,
  }: {
    instanceName: string;
    origin: string;
    event: string;
    data: Object;
    serverUrl: string;
    dateTime: string;
    sender: string;
    apiKey?: string;
    local?: boolean;
  }): Promise<void> {
    const emitData = {
      instanceName,
      origin,
      event,
      data,
      serverUrl,
      dateTime,
      sender,
      apiKey,
      local,
    };
    // websocket
    await websocketController.emit(emitData);

    // rabbitmq
    await rabbitmqController.emit(emitData);

    // sqs
    await sqsController.emit(emitData);

    // webhook
    await webhookController.emit(emitData);
  }

  public async setInstance(instanceName: string, data: any): Promise<any> {
    // websocket
    if (data.websocketEnabled)
      await websocketController.set(instanceName, {
        enabled: true,
        events: data.websocketEvents,
      });

    // rabbitmq
    if (data.rabbitmqEnabled)
      await rabbitmqController.set(instanceName, {
        enabled: true,
        events: data.rabbitmqEvents,
      });

    // sqs
    if (data.sqsEnabled)
      await sqsController.set(instanceName, {
        enabled: true,
        events: data.sqsEvents,
      });

    // webhook
    if (data.webhookEnabled)
      await webhookController.set(instanceName, {
        enabled: true,
        events: data.webhookEvents,
        url: data.webhookUrl,
        webhookBase64: data.webhookBase64,
        webhookByEvents: data.webhookByEvents,
      });
  }
}
