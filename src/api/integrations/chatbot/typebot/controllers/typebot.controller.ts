import { InstanceDto } from '@api/dto/instance.dto';
import { TypebotDto } from '@api/integrations/chatbot/typebot/dto/typebot.dto';
import { TypebotService } from '@api/integrations/chatbot/typebot/services/typebot.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Events } from '@api/types/wa.types';
import { configService, Typebot } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';
import { IntegrationSession, Typebot as TypebotModel } from '@prisma/client';
import axios from 'axios';

import { BaseChatbotController } from '../../base-chatbot.controller';

export class TypebotController extends BaseChatbotController<TypebotModel, TypebotDto> {
  constructor(
    private readonly typebotService: TypebotService,
    prismaRepository: PrismaRepository,
    waMonitor: WAMonitoringService,
  ) {
    super(prismaRepository, waMonitor);

    this.botRepository = this.prismaRepository.typebot;
    this.settingsRepository = this.prismaRepository.typebotSetting;
    this.sessionRepository = this.prismaRepository.integrationSession;
  }

  public readonly logger = new Logger('TypebotController');
  protected readonly integrationName = 'Typebot';

  integrationEnabled = configService.get<Typebot>('TYPEBOT').ENABLED;
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};

  protected getFallbackBotId(settings: any): string | undefined {
    return settings?.typebotIdFallback;
  }

  protected getFallbackFieldName(): string {
    return 'typebotIdFallback';
  }

  protected getIntegrationType(): string {
    return 'typebot';
  }

  protected getAdditionalBotData(data: TypebotDto): Record<string, any> {
    return {
      url: data.url,
      typebot: data.typebot,
    };
  }

  // Implementation for bot-specific updates
  protected getAdditionalUpdateFields(data: TypebotDto): Record<string, any> {
    return {
      url: data.url,
      typebot: data.typebot,
    };
  }

  // Implementation for bot-specific duplicate validation on update
  protected async validateNoDuplicatesOnUpdate(botId: string, instanceId: string, data: TypebotDto): Promise<void> {
    const checkDuplicate = await this.botRepository.findFirst({
      where: {
        url: data.url,
        typebot: data.typebot,
        id: {
          not: botId,
        },
        instanceId: instanceId,
      },
    });

    if (checkDuplicate) {
      throw new Error('Typebot already exists');
    }
  }

  // Process Typebot-specific bot logic
  protected async processBot(
    instance: any,
    remoteJid: string,
    bot: TypebotModel,
    session: IntegrationSession,
    settings: any,
    content: string,
    pushName?: string,
    msg?: any,
  ) {
    // Use the simplified service method that follows the base class pattern
    await this.typebotService.processTypebot(instance, remoteJid, bot, session, settings, content, pushName, msg);
  }

  // TypeBot specific method for starting a bot from API
  public async startBot(instance: InstanceDto, data: any) {
    if (!this.integrationEnabled)
      throw new BadRequestException('Typebot is disabled');

    if (data.remoteJid === 'status@broadcast') return;

    const instanceData = await this.prismaRepository.instance.findFirst({
      where: {
        id: instance.instanceId,
      },
    });

    if (!instanceData) throw new Error('Instance not found');

    const remoteJid = data.remoteJid;
    const url = data.url;
    const typebot = data.typebot;
    const startSession = data.startSession;
    const variables = data.variables;
    let expire = data?.typebot?.expire;
    let keywordFinish = data?.typebot?.keywordFinish;
    let delayMessage = data?.typebot?.delayMessage;
    let unknownMessage = data?.typebot?.unknownMessage;
    let listeningFromMe = data?.typebot?.listeningFromMe;
    let stopBotFromMe = data?.typebot?.stopBotFromMe;
    let keepOpen = data?.typebot?.keepOpen;
    let debounceTime = data?.typebot?.debounceTime;
    let ignoreJids = data?.typebot?.ignoreJids;

    const defaultSettingCheck = await this.settingsRepository.findFirst({
      where: {
        instanceId: instanceData.id,
      },
    });

    if (this.checkIgnoreJids(defaultSettingCheck?.ignoreJids, remoteJid)) throw new Error('Jid not allowed');

    if (
      !expire ||
      !keywordFinish ||
      !delayMessage ||
      !unknownMessage ||
      !listeningFromMe ||
      !stopBotFromMe ||
      !keepOpen ||
      !debounceTime ||
      !ignoreJids
    ) {
      if (expire === undefined || expire === null) expire = defaultSettingCheck.expire;
      if (keywordFinish === undefined || keywordFinish === null) keywordFinish = defaultSettingCheck.keywordFinish;
      if (delayMessage === undefined || delayMessage === null) delayMessage = defaultSettingCheck.delayMessage;
      if (unknownMessage === undefined || unknownMessage === null) unknownMessage = defaultSettingCheck.unknownMessage;
      if (listeningFromMe === undefined || listeningFromMe === null)
        listeningFromMe = defaultSettingCheck.listeningFromMe;
      if (stopBotFromMe === undefined || stopBotFromMe === null) stopBotFromMe = defaultSettingCheck.stopBotFromMe;
      if (keepOpen === undefined || keepOpen === null) keepOpen = defaultSettingCheck.keepOpen;
      if (debounceTime === undefined || debounceTime === null) debounceTime = defaultSettingCheck.debounceTime;
      if (ignoreJids === undefined || ignoreJids === null) ignoreJids = defaultSettingCheck.ignoreJids;

      if (!defaultSettingCheck) {
        await this.settings(instance, {
          expire: expire,
          keywordFinish: keywordFinish,
          delayMessage: delayMessage,
          unknownMessage: unknownMessage,
          listeningFromMe: listeningFromMe,
          stopBotFromMe: stopBotFromMe,
          keepOpen: keepOpen,
          debounceTime: debounceTime,
          ignoreJids: ignoreJids,
        });
      }
    }

    const prefilledVariables: any = {};

    if (variables?.length) {
      variables.forEach((variable: { name: string | number; value: string }) => {
        prefilledVariables[variable.name] = variable.value;
      });
    }

    if (startSession) {
      let findBot: any = await this.botRepository.findFirst({
        where: {
          url: url,
          typebot: typebot,
          instanceId: instanceData.id,
        },
      });

      if (!findBot) {
        findBot = await this.botRepository.create({
          data: {
            enabled: true,
            url: url,
            typebot: typebot,
            instanceId: instanceData.id,
            expire: expire,
            keywordFinish: keywordFinish,
            delayMessage: delayMessage,
            unknownMessage: unknownMessage,
            listeningFromMe: listeningFromMe,
            stopBotFromMe: stopBotFromMe,
            keepOpen: keepOpen,
          },
        });
      }

      await this.prismaRepository.integrationSession.deleteMany({
        where: {
          remoteJid: remoteJid,
          instanceId: instanceData.id,
          botId: { not: null },
        },
      });

      // Use the simplified service method instead of the complex one
      const settings = {
        expire,
        keywordFinish,
        delayMessage,
        unknownMessage,
        listeningFromMe,
        stopBotFromMe,
        keepOpen,
      };

      await this.typebotService.processTypebot(
        instanceData,
        remoteJid,
        findBot,
        null, // session
        settings,
        'init',
        null, // pushName
        prefilledVariables,
      );
    } else {
      const id = Math.floor(Math.random() * 10000000000).toString();

      try {
        const version = configService.get<Typebot>('TYPEBOT').API_VERSION;
        let url: string;
        let reqData: {};
        if (version === 'latest') {
          url = `${data.url}/api/v1/typebots/${data.typebot}/startChat`;

          reqData = {
            prefilledVariables: prefilledVariables,
          };
        } else {
          url = `${data.url}/api/v1/sendMessage`;

          reqData = {
            startParams: {
              publicId: data.typebot,
              prefilledVariables: prefilledVariables,
            },
          };
        }
        const request = await axios.post(url, reqData);

        await this.typebotService.sendWAMessage(
          instanceData,
          null,
          {
            expire: expire,
            keywordFinish: keywordFinish,
            delayMessage: delayMessage,
            unknownMessage: unknownMessage,
            listeningFromMe: listeningFromMe,
            stopBotFromMe: stopBotFromMe,
            keepOpen: keepOpen,
          },
          remoteJid,
          request.data.messages,
          request.data.input,
          request.data.clientSideActions,
        );

        this.waMonitor.waInstances[instance.instanceId].sendDataWebhook(Events.TYPEBOT_START, {
          remoteJid: remoteJid,
          url: url,
          typebot: typebot,
          variables: variables,
          sessionId: id,
        });
      } catch (error) {
        this.logger.error(error);
        return;
      }
    }

    return {
      typebot: {
        ...instance,
        typebot: {
          url: url,
          remoteJid: remoteJid,
          typebot: typebot,
          prefilledVariables: prefilledVariables,
        },
      },
    };
  }
}
