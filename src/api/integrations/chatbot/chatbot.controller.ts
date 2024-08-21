import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { difyController, openaiController, typebotController, websocketController } from '@api/server.module';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Logger } from '@config/logger.config';
import { IntegrationSession } from '@prisma/client';
import { findBotByTrigger } from '@utils/findBotByTrigger';

export class ChatbotController {
  public prismaRepository: PrismaRepository;
  public waMonitor: WAMonitoringService;

  public readonly logger = new Logger(ChatbotController.name);

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

  public processDebounce(
    userMessageDebounce: any,
    content: string,
    remoteJid: string,
    debounceTime: number,
    callback: any,
  ) {
    if (userMessageDebounce[remoteJid]) {
      userMessageDebounce[remoteJid].message += ` ${content}`;
      this.logger.log('message debounced: ' + userMessageDebounce[remoteJid].message);
      clearTimeout(userMessageDebounce[remoteJid].timeoutId);
    } else {
      userMessageDebounce[remoteJid] = {
        message: content,
        timeoutId: null,
      };
    }

    userMessageDebounce[remoteJid].timeoutId = setTimeout(() => {
      const myQuestion = userMessageDebounce[remoteJid].message;
      this.logger.log('Debounce complete. Processing message: ' + myQuestion);

      delete userMessageDebounce[remoteJid];
      callback(myQuestion);
    }, debounceTime * 1000);
  }

  public checkIgnoreJids(ignoreJids: any, remoteJid: string) {
    if (ignoreJids && ignoreJids.length > 0) {
      let ignoreGroups = false;
      let ignoreContacts = false;

      if (ignoreJids.includes('@g.us')) {
        ignoreGroups = true;
      }

      if (ignoreJids.includes('@s.whatsapp.net')) {
        ignoreContacts = true;
      }

      if (ignoreGroups && remoteJid.endsWith('@g.us')) {
        this.logger.warn('Ignoring message from group: ' + remoteJid);
        return true;
      }

      if (ignoreContacts && remoteJid.endsWith('@s.whatsapp.net')) {
        this.logger.warn('Ignoring message from contact: ' + remoteJid);
        return true;
      }

      if (ignoreJids.includes(remoteJid)) {
        this.logger.warn('Ignoring message from jid: ' + remoteJid);
        return true;
      }

      return false;
    }

    return false;
  }

  public async getSession(remoteJid: string, instance: InstanceDto) {
    let session = await this.prismaRepository.integrationSession.findFirst({
      where: {
        remoteJid: remoteJid,
        instanceId: instance.instanceId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (session) {
      if (session.status !== 'closed' && !session.botId) {
        this.logger.warn('Session is already opened in another integration');
        return;
      } else if (!session.botId) {
        session = null;
      }
    }

    return session;
  }

  public async findBotTrigger(
    botRepository: any,
    settingsRepository: any,
    content: string,
    instance: InstanceDto,
    session?: IntegrationSession,
  ) {
    let findBot = null;

    if (!session) {
      findBot = await findBotByTrigger(botRepository, settingsRepository, content, instance.instanceId);

      if (!findBot) {
        return;
      }
    } else {
      findBot = await botRepository.findFirst({
        where: {
          id: session.botId,
        },
      });
    }

    return findBot;
  }
}
