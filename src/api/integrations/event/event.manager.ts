import { RabbitmqController } from '@api/integrations/event/rabbitmq/rabbitmq.controller';
import { SqsController } from '@api/integrations/event/sqs/sqs.controller';
import { WebhookController } from '@api/integrations/event/webhook/webhook.controller';
import { WebsocketController } from '@api/integrations/event/websocket/websocket.controller';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Server } from 'http';

export class EventManager {
  private prismaRepository: PrismaRepository;
  private waMonitor: WAMonitoringService;
  private websocketController: WebsocketController;
  private webhookController: WebhookController;
  private rabbitmqController: RabbitmqController;
  private sqsController: SqsController;

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    this.prisma = prismaRepository;
    this.monitor = waMonitor;

    this.websocket = new WebsocketController(prismaRepository, waMonitor);
    this.webhook = new WebhookController(prismaRepository, waMonitor);
    this.rabbitmq = new RabbitmqController(prismaRepository, waMonitor);
    this.sqs = new SqsController(prismaRepository, waMonitor);
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

  public set websocket(websocket: WebsocketController) {
    this.websocketController = websocket;
  }

  public get websocket() {
    return this.websocketController;
  }

  public set webhook(webhook: WebhookController) {
    this.webhookController = webhook;
  }

  public get webhook() {
    return this.webhookController;
  }

  public set rabbitmq(rabbitmq: RabbitmqController) {
    this.rabbitmqController = rabbitmq;
  }

  public get rabbitmq() {
    return this.rabbitmqController;
  }

  public set sqs(sqs: SqsController) {
    this.sqsController = sqs;
  }

  public get sqs() {
    return this.sqsController;
  }

  public init(httpServer: Server): void {
    this.websocket.init(httpServer);
    this.rabbitmq.init();
    this.sqs.init();
  }

  public async emit(eventData: {
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
    await this.websocket.emit(eventData);
    await this.rabbitmq.emit(eventData);
    await this.sqs.emit(eventData);
    await this.webhook.emit(eventData);
  }

  public async setInstance(instanceName: string, data: any): Promise<any> {
    if (data.websocket)
      await this.websocket.set(instanceName, {
        websocket: {
          enabled: data.websocket?.enabled,
          events: data.websocket?.events,
        },
      });

    if (data.rabbitmq)
      await this.rabbitmq.set(instanceName, {
        rabbitmq: {
          enabled: data.rabbitmq?.enabled,
          events: data.rabbitmq?.events,
        },
      });

    if (data.sqs)
      await this.sqs.set(instanceName, {
        sqs: {
          enabled: data.sqs?.enabled,
          events: data.sqs?.events,
        },
      });

    if (data.webhook)
      await this.webhook.set(instanceName, {
        webhook: {
          enabled: data.webhook?.enabled,
          events: data.webhook?.events,
          url: data.webhook?.url,
          base64: data.webhook?.base64,
          byEvents: data.webhook?.byEvents,
        },
      });
  }
}
