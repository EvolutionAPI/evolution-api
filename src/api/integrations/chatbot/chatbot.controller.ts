import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { difyController, openaiController, typebotController, websocketController } from '@api/server.module';
import { WAMonitoringService } from '@api/services/monitor.service';

export class ChatbotController {
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

  public async emit({
    instance,
    remoteJid,
    msg,
    pushName,
  }: {
    instance: InstanceDto;
    remoteJid: string;
    msg: any;
    pushName?: string;
  }): Promise<void> {
    const emitData = {
      instance,
      remoteJid,
      msg,
      pushName,
    };
    // typebot
    await typebotController.emit(emitData);

    // openai
    await openaiController.emit(emitData);

    // dify
    await difyController.emit(emitData);
  }

  public async setInstance(instanceName: string, data: any): Promise<any> {
    // chatwoot
    if (data.websocketEnabled)
      await websocketController.set(instanceName, {
        enabled: true,
        events: data.websocketEvents,
      });
  }
}
