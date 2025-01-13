import { Logger } from '@config/logger.config';
import { IgnoreJidDto } from '@api/dto/chatbot.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { OpenaiCredsDto, OpenaiDto } from '@api/integrations/chatbot/openai/dto/openai.dto';
import { OpenaiService } from '@api/integrations/chatbot/openai/services/openai.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { configService, Openai } from '@config/env.config';
import { BadRequestException } from '@exceptions';
import { OpenaiBot } from '@prisma/client';
import { getConversationMessage } from '@utils/getConversationMessage';
import OpenAI from 'openai';

import { ChatbotController, ChatbotControllerInterface, EmitData } from '../../chatbot.controller';

export class OpenaiController extends ChatbotController implements ChatbotControllerInterface {
  constructor(
    private readonly openaiService: OpenaiService,
    prismaRepository: PrismaRepository,
    waMonitor: WAMonitoringService,
  ) {
    super(prismaRepository, waMonitor);

    this.botRepository = this.prismaRepository.openaiBot;
    this.settingsRepository = this.prismaRepository.openaiSetting;
    this.sessionRepository = this.prismaRepository.integrationSession;
    this.credsRepository = this.prismaRepository.openaiCreds;
  }

  public readonly logger = new Logger('OpenaiController');

  integrationEnabled = configService.get<Openai>('OPENAI').ENABLED;
  botRepository: any;
  settingsRepository: any;
  sessionRepository: any;
  userMessageDebounce: { [key: string]: { message: string; timeoutId: NodeJS.Timeout } } = {};
  private client: OpenAI;
  private credsRepository: any;

  // Credentials
  public async createOpenaiCreds(instance: InstanceDto, data: OpenaiCredsDto) {
    this.logger.debug(`[createOpenaiCreds] -> Iniciando método com instance: ${JSON.stringify(instance)} e data: ${JSON.stringify(data)}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[createOpenaiCreds] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[createOpenaiCreds] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      if (!data.apiKey) {
        this.logger.error('[createOpenaiCreds] -> Falha: API Key não fornecida.');
        throw new Error('API Key is required');
      }
      if (!data.name) {
        this.logger.error('[createOpenaiCreds] -> Falha: Nome não fornecido.');
        throw new Error('Name is required');
      }

      this.logger.debug('[createOpenaiCreds] -> Tentando criar credenciais no banco...');
      const creds = await this.credsRepository.create({
        data: {
          name: data.name,
          apiKey: data.apiKey,
          instanceId: instanceId,
        },
      });

      this.logger.debug(`[createOpenaiCreds] -> Credenciais criadas com sucesso: ${JSON.stringify(creds)}`);
      return creds;
    } catch (error) {
      this.logger.error(`[createOpenaiCreds] -> Erro ao criar credenciais: ${error}`);
      throw new Error('Error creating openai creds');
    }
  }

  public async findOpenaiCreds(instance: InstanceDto) {
    this.logger.debug(`[findOpenaiCreds] -> Iniciando método com instance: ${JSON.stringify(instance)}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[findOpenaiCreds] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[findOpenaiCreds] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      const creds = await this.credsRepository.findMany({
        where: {
          instanceId: instanceId,
        },
        include: {
          OpenaiAssistant: true,
        },
      });

      this.logger.debug(`[findOpenaiCreds] -> Credenciais encontradas: ${JSON.stringify(creds)}`);
      return creds;
    } catch (error) {
      this.logger.error(`[findOpenaiCreds] -> Erro ao buscar credenciais: ${error}`);
      throw error;
    }
  }

  public async deleteCreds(instance: InstanceDto, openaiCredsId: string) {
    this.logger.debug(`[deleteCreds] -> Iniciando método com instance: ${JSON.stringify(instance)} e openaiCredsId: ${openaiCredsId}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[deleteCreds] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[deleteCreds] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      const creds = await this.credsRepository.findFirst({
        where: {
          id: openaiCredsId,
        },
      });

      if (!creds) {
        this.logger.warn(`[deleteCreds] -> Credenciais não encontradas com id: ${openaiCredsId}`);
        throw new Error('Openai Creds not found');
      }

      if (creds.instanceId !== instanceId) {
        this.logger.warn('[deleteCreds] -> Credenciais não pertencem a esta instância');
        throw new Error('Openai Creds not found');
      }

      this.logger.debug('[deleteCreds] -> Tentando deletar credenciais no banco...');
      await this.credsRepository.delete({
        where: {
          id: openaiCredsId,
        },
      });

      this.logger.debug(`[deleteCreds] -> Credenciais deletadas com sucesso: ${openaiCredsId}`);
      return { openaiCreds: { id: openaiCredsId } };
    } catch (error) {
      this.logger.error(`[deleteCreds] -> Erro ao deletar credenciais: ${error}`);
      throw new Error('Error deleting openai creds');
    }
  }

  // Models
  public async getModels(instance: InstanceDto) {
    this.logger.debug(`[getModels] -> Iniciando método com instance: ${JSON.stringify(instance)}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[getModels] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[getModels] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      if (!instanceId) {
        this.logger.warn('[getModels] -> Instância não encontrada.');
        throw new Error('Instance not found');
      }

      const defaultSettings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
        include: {
          OpenaiCreds: true,
        },
      });

      if (!defaultSettings) {
        this.logger.warn('[getModels] -> Configurações padrão não encontradas.');
        throw new Error('Settings not found');
      }

      const { apiKey } = defaultSettings.OpenaiCreds;
      this.logger.debug(`[getModels] -> Criando cliente OpenAI com apiKey: ${apiKey ? '*****' : 'não fornecida'}`);

      this.client = new OpenAI({ apiKey });

      this.logger.debug('[getModels] -> Buscando lista de modelos no OpenAI...');
      const models: any = await this.client.models.list();

      this.logger.debug(`[getModels] -> Modelos retornados: ${JSON.stringify(models?.body?.data)}`);
      return models?.body?.data;
    } catch (error) {
      this.logger.error(`[getModels] -> Erro ao buscar modelos: ${error}`);
      throw new Error('Error fetching models');
    }
  }

  // Bots
  public async createBot(instance: InstanceDto, data: OpenaiDto) {
    this.logger.debug(`[createBot] -> Iniciando método com instance: ${JSON.stringify(instance)} e data: ${JSON.stringify(data)}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[createBot] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[createBot] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      this.logger.debug('[createBot] -> Verificando e aplicando configurações padrão, caso necessário...');

      if (
        !data.openaiCredsId ||
        !data.expire ||
        !data.keywordFinish ||
        !data.delayMessage ||
        !data.unknownMessage ||
        !data.listeningFromMe ||
        !data.stopBotFromMe ||
        !data.keepOpen ||
        !data.debounceTime ||
        !data.ignoreJids ||
        !data.splitMessages ||
        !data.timePerChar
      ) {
        const defaultSettingCheck = await this.settingsRepository.findFirst({
          where: {
            instanceId: instanceId,
          },
        });

        if (data.expire === undefined || data.expire === null) data.expire = defaultSettingCheck?.expire;
        if (data.keywordFinish === undefined || data.keywordFinish === null) data.keywordFinish = defaultSettingCheck?.keywordFinish;
        if (data.delayMessage === undefined || data.delayMessage === null) data.delayMessage = defaultSettingCheck?.delayMessage;
        if (data.unknownMessage === undefined || data.unknownMessage === null) data.unknownMessage = defaultSettingCheck?.unknownMessage;
        if (data.listeningFromMe === undefined || data.listeningFromMe === null) data.listeningFromMe = defaultSettingCheck?.listeningFromMe;
        if (data.stopBotFromMe === undefined || data.stopBotFromMe === null) data.stopBotFromMe = defaultSettingCheck?.stopBotFromMe;
        if (data.keepOpen === undefined || data.keepOpen === null) data.keepOpen = defaultSettingCheck?.keepOpen;
        if (data.debounceTime === undefined || data.debounceTime === null) data.debounceTime = defaultSettingCheck?.debounceTime;
        if (data.ignoreJids === undefined || data.ignoreJids === null) data.ignoreJids = defaultSettingCheck?.ignoreJids;
        if (data.splitMessages === undefined || data.splitMessages === null) data.splitMessages = defaultSettingCheck?.splitMessages ?? false;
        if (data.timePerChar === undefined || data.timePerChar === null) data.timePerChar = defaultSettingCheck?.timePerChar ?? 0;

        if (!data.openaiCredsId) {
          this.logger.error('[createBot] -> Falha: openaiCredsId não foi fornecido e é obrigatório.');
          throw new Error('Openai Creds Id is required');
        }

        if (!defaultSettingCheck) {
          this.logger.debug('[createBot] -> Não existem configurações padrão, criando...');
          await this.settings(instance, {
            openaiCredsId: data.openaiCredsId,
            expire: data.expire,
            keywordFinish: data.keywordFinish,
            delayMessage: data.delayMessage,
            unknownMessage: data.unknownMessage,
            listeningFromMe: data.listeningFromMe,
            stopBotFromMe: data.stopBotFromMe,
            keepOpen: data.keepOpen,
            debounceTime: data.debounceTime,
            ignoreJids: data.ignoreJids,
            splitMessages: data.splitMessages,
            timePerChar: data.timePerChar,
          });
        }
      }

      this.logger.debug('[createBot] -> Verificando se já existe bot com triggerType = "all" habilitado...');
      const checkTriggerAll = await this.botRepository.findFirst({
        where: {
          enabled: true,
          triggerType: 'all',
          instanceId: instanceId,
        },
      });

      if (checkTriggerAll && data.triggerType === 'all') {
        this.logger.error('[createBot] -> Já existe um bot com triggerType "all" habilitado, falha.');
        throw new Error('You already have a openai with an "All" trigger, you cannot have more bots while it is active');
      }

      let whereDuplication: any = {
        instanceId: instanceId,
      };

      if (data.botType === 'assistant') {
        if (!data.assistantId) {
          this.logger.error('[createBot] -> Falha: assistantId não fornecido para botType=assistant.');
          throw new Error('Assistant ID is required');
        }

        whereDuplication = {
          ...whereDuplication,
          assistantId: data.assistantId,
          botType: data.botType,
        };
      } else if (data.botType === 'chatCompletion') {
        if (!data.model) {
          this.logger.error('[createBot] -> Falha: model não fornecido para botType=chatCompletion.');
          throw new Error('Model is required');
        }
        if (!data.maxTokens) {
          this.logger.error('[createBot] -> Falha: maxTokens não fornecido para botType=chatCompletion.');
          throw new Error('Max tokens is required');
        }

        whereDuplication = {
          ...whereDuplication,
          model: data.model,
          maxTokens: data.maxTokens,
          botType: data.botType,
        };
      } else {
        this.logger.error('[createBot] -> Falha: botType não fornecido.');
        throw new Error('Bot type is required');
      }

      this.logger.debug('[createBot] -> Verificando duplicação de bot...');
      const checkDuplicate = await this.botRepository.findFirst({
        where: whereDuplication,
      });

      if (checkDuplicate) {
        this.logger.error('[createBot] -> Bot duplicado encontrado, falha.');
        throw new Error('Openai Bot already exists');
      }

      if (data.triggerType === 'keyword') {
        if (!data.triggerOperator || !data.triggerValue) {
          this.logger.error('[createBot] -> Falha: triggerOperator ou triggerValue não fornecido para triggerType=keyword.');
          throw new Error('Trigger operator and value are required');
        }

        const checkDuplicate = await this.botRepository.findFirst({
          where: {
            triggerOperator: data.triggerOperator,
            triggerValue: data.triggerValue,
            instanceId: instanceId,
          },
        });

        if (checkDuplicate) {
          this.logger.error('[createBot] -> Trigger duplicado encontrado para triggerType=keyword.');
          throw new Error('Trigger already exists');
        }
      }

      if (data.triggerType === 'advanced') {
        if (!data.triggerValue) {
          this.logger.error('[createBot] -> Falha: triggerValue não fornecido para triggerType=advanced.');
          throw new Error('Trigger value is required');
        }

        const checkDuplicate = await this.botRepository.findFirst({
          where: {
            triggerValue: data.triggerValue,
            instanceId: instanceId,
          },
        });

        if (checkDuplicate) {
          this.logger.error('[createBot] -> Trigger duplicado encontrado para triggerType=advanced.');
          throw new Error('Trigger already exists');
        }
      }

      this.logger.debug('[createBot] -> Criando bot no banco de dados...');
      const bot = await this.botRepository.create({
        data: {
          enabled: data?.enabled,
          description: data.description,
          openaiCredsId: data.openaiCredsId,
          botType: data.botType,
          assistantId: data.assistantId,
          functionUrl: data.functionUrl,
          model: data.model,
          systemMessages: data.systemMessages,
          assistantMessages: data.assistantMessages,
          userMessages: data.userMessages,
          maxTokens: data.maxTokens,
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          stopBotFromMe: data.stopBotFromMe,
          keepOpen: data.keepOpen,
          debounceTime: data.debounceTime,
          instanceId: instanceId,
          triggerType: data.triggerType,
          triggerOperator: data.triggerOperator,
          triggerValue: data.triggerValue,
          ignoreJids: data.ignoreJids,
          splitMessages: data.splitMessages,
          timePerChar: data.timePerChar,
        },
      });

      this.logger.debug(`[createBot] -> Bot criado com sucesso: ${JSON.stringify(bot)}`);
      return bot;
    } catch (error) {
      this.logger.error(`[createBot] -> Erro ao criar bot: ${error}`);
      throw new Error('Error creating openai bot');
    }
  }

  public async findBot(instance: InstanceDto) {
    this.logger.debug(`[findBot] -> Iniciando método com instance: ${JSON.stringify(instance)}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[findBot] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[findBot] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      const bots = await this.botRepository.findMany({
        where: {
          instanceId,
        },
      });

      this.logger.debug(`[findBot] -> Bots encontrados: ${JSON.stringify(bots)}`);
      if (!bots.length) {
        this.logger.debug('[findBot] -> Nenhum bot encontrado.');
        return null;
      }

      return bots;
    } catch (error) {
      this.logger.error(`[findBot] -> Erro ao buscar bots: ${error}`);
      throw error;
    }
  }

  public async fetchBot(instance: InstanceDto, botId: string) {
    this.logger.debug(`[fetchBot] -> Iniciando método com instance: ${JSON.stringify(instance)} e botId: ${botId}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[fetchBot] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[fetchBot] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      const bot = await this.botRepository.findFirst({
        where: {
          id: botId,
        },
      });

      if (!bot) {
        this.logger.warn(`[fetchBot] -> Bot não encontrado com id: ${botId}`);
        throw new Error('Openai Bot not found');
      }

      if (bot.instanceId !== instanceId) {
        this.logger.warn('[fetchBot] -> Bot não pertence a esta instância');
        throw new Error('Openai Bot not found');
      }

      this.logger.debug(`[fetchBot] -> Bot encontrado: ${JSON.stringify(bot)}`);
      return bot;
    } catch (error) {
      this.logger.error(`[fetchBot] -> Erro ao buscar bot: ${error}`);
      throw error;
    }
  }

  public async updateBot(instance: InstanceDto, botId: string, data: OpenaiDto) {
    this.logger.debug(`[updateBot] -> Iniciando método com instance: ${JSON.stringify(instance)}, botId: ${botId} e data: ${JSON.stringify(data)}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[updateBot] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[updateBot] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      const bot = await this.botRepository.findFirst({
        where: {
          id: botId,
        },
      });

      if (!bot) {
        this.logger.warn(`[updateBot] -> Bot não encontrado com id: ${botId}`);
        throw new Error('Openai Bot not found');
      }

      if (bot.instanceId !== instanceId) {
        this.logger.warn('[updateBot] -> Bot não pertence a esta instância');
        throw new Error('Openai Bot not found');
      }

      if (data.triggerType === 'all') {
        this.logger.debug('[updateBot] -> Verificando se já existe outro bot com triggerType = "all" habilitado...');
        const checkTriggerAll = await this.botRepository.findFirst({
          where: {
            enabled: true,
            triggerType: 'all',
            id: {
              not: botId,
            },
            instanceId: instanceId,
          },
        });

        if (checkTriggerAll) {
          this.logger.error('[updateBot] -> Já existe um bot com triggerType "all" habilitado, falha.');
          throw new Error(
            'You already have a openai bot with an "All" trigger, you cannot have more bots while it is active',
          );
        }
      }

      let whereDuplication: any = {
        id: {
          not: botId,
        },
        instanceId: instanceId,
      };

      if (data.botType === 'assistant') {
        if (!data.assistantId) {
          this.logger.error('[updateBot] -> Falha: assistantId não fornecido para botType=assistant.');
          throw new Error('Assistant ID is required');
        }

        whereDuplication = {
          ...whereDuplication,
          assistantId: data.assistantId,
        };
      } else if (data.botType === 'chatCompletion') {
        if (!data.model) {
          this.logger.error('[updateBot] -> Falha: model não fornecido para botType=chatCompletion.');
          throw new Error('Model is required');
        }
        if (!data.maxTokens) {
          this.logger.error('[updateBot] -> Falha: maxTokens não fornecido para botType=chatCompletion.');
          throw new Error('Max tokens is required');
        }

        whereDuplication = {
          ...whereDuplication,
          model: data.model,
          maxTokens: data.maxTokens,
        };
      } else {
        this.logger.error('[updateBot] -> Falha: botType não fornecido.');
        throw new Error('Bot type is required');
      }

      this.logger.debug('[updateBot] -> Verificando duplicação de bot...');
      const checkDuplicate = await this.botRepository.findFirst({
        where: whereDuplication,
      });

      if (checkDuplicate) {
        this.logger.error('[updateBot] -> Bot duplicado encontrado, falha.');
        throw new Error('Openai Bot already exists');
      }

      if (data.triggerType === 'keyword') {
        if (!data.triggerOperator || !data.triggerValue) {
          this.logger.error('[updateBot] -> Falha: triggerOperator ou triggerValue não fornecido para triggerType=keyword.');
          throw new Error('Trigger operator and value are required');
        }

        const checkDuplicate = await this.botRepository.findFirst({
          where: {
            triggerOperator: data.triggerOperator,
            triggerValue: data.triggerValue,
            id: { not: botId },
            instanceId: instanceId,
          },
        });

        if (checkDuplicate) {
          this.logger.error('[updateBot] -> Trigger duplicado encontrado para triggerType=keyword.');
          throw new Error('Trigger already exists');
        }
      }

      if (data.triggerType === 'advanced') {
        if (!data.triggerValue) {
          this.logger.error('[updateBot] -> Falha: triggerValue não fornecido para triggerType=advanced.');
          throw new Error('Trigger value is required');
        }

        const checkDuplicate = await this.botRepository.findFirst({
          where: {
            triggerValue: data.triggerValue,
            id: { not: botId },
            instanceId: instanceId,
          },
        });

        if (checkDuplicate) {
          this.logger.error('[updateBot] -> Trigger duplicado encontrado para triggerType=advanced.');
          throw new Error('Trigger already exists');
        }
      }

      this.logger.debug('[updateBot] -> Atualizando bot no banco de dados...');
      const updatedBot = await this.botRepository.update({
        where: {
          id: botId,
        },
        data: {
          enabled: data?.enabled,
          description: data.description,
          openaiCredsId: data.openaiCredsId,
          botType: data.botType,
          assistantId: data.assistantId,
          functionUrl: data.functionUrl,
          model: data.model,
          systemMessages: data.systemMessages,
          assistantMessages: data.assistantMessages,
          userMessages: data.userMessages,
          maxTokens: data.maxTokens,
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          stopBotFromMe: data.stopBotFromMe,
          keepOpen: data.keepOpen,
          debounceTime: data.debounceTime,
          instanceId: instanceId,
          triggerType: data.triggerType,
          triggerOperator: data.triggerOperator,
          triggerValue: data.triggerValue,
          ignoreJids: data.ignoreJids,
          splitMessages: data.splitMessages,
          timePerChar: data.timePerChar,
        },
      });

      this.logger.debug(`[updateBot] -> Bot atualizado com sucesso: ${JSON.stringify(updatedBot)}`);
      return updatedBot;
    } catch (error) {
      this.logger.error(`[updateBot] -> Erro ao atualizar bot: ${error}`);
      throw new Error('Error updating openai bot');
    }
  }

  public async deleteBot(instance: InstanceDto, botId: string) {
    this.logger.debug(`[deleteBot] -> Iniciando método com instance: ${JSON.stringify(instance)} e botId: ${botId}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[deleteBot] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[deleteBot] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      const bot = await this.botRepository.findFirst({
        where: {
          id: botId,
        },
      });

      if (!bot) {
        this.logger.warn(`[deleteBot] -> Bot não encontrado com id: ${botId}`);
        throw new Error('Openai bot not found');
      }

      if (bot.instanceId !== instanceId) {
        this.logger.warn('[deleteBot] -> Bot não pertence a esta instância');
        throw new Error('Openai bot not found');
      }

      this.logger.debug('[deleteBot] -> Deletando sessões e bot no banco...');
      await this.sessionRepository.deleteMany({
        where: {
          botId: botId,
        },
      });

      await this.botRepository.delete({
        where: {
          id: botId,
        },
      });

      this.logger.debug(`[deleteBot] -> Bot deletado com sucesso: ${botId}`);
      return { bot: { id: botId } };
    } catch (error) {
      this.logger.error(`[deleteBot] -> Erro ao deletar bot: ${error}`);
      throw new Error('Error deleting openai bot');
    }
  }

  // Settings
  public async settings(instance: InstanceDto, data: any) {
    this.logger.debug(`[settings] -> Iniciando método com instance: ${JSON.stringify(instance)}, data: ${JSON.stringify(data)}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[settings] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[settings] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      const settings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
      });

      if (settings) {
        this.logger.debug('[settings] -> Atualizando configurações existentes...');
        const updateSettings = await this.settingsRepository.update({
          where: {
            id: settings.id,
          },
          data: {
            openaiCredsId: data.openaiCredsId,
            expire: data.expire,
            keywordFinish: data.keywordFinish,
            delayMessage: data.delayMessage,
            unknownMessage: data.unknownMessage,
            listeningFromMe: data.listeningFromMe,
            stopBotFromMe: data.stopBotFromMe,
            keepOpen: data.keepOpen,
            debounceTime: data.debounceTime,
            speechToText: data.speechToText,
            openaiIdFallback: data.openaiIdFallback,
            ignoreJids: data.ignoreJids,
            splitMessages: data.splitMessages,
            timePerChar: data.timePerChar,
          },
        });

        this.logger.debug(`[settings] -> Configurações atualizadas: ${JSON.stringify(updateSettings)}`);
        return {
          openaiCredsId: updateSettings.openaiCredsId,
          expire: updateSettings.expire,
          keywordFinish: updateSettings.keywordFinish,
          delayMessage: updateSettings.delayMessage,
          unknownMessage: updateSettings.unknownMessage,
          listeningFromMe: updateSettings.listeningFromMe,
          stopBotFromMe: updateSettings.stopBotFromMe,
          keepOpen: updateSettings.keepOpen,
          debounceTime: updateSettings.debounceTime,
          speechToText: updateSettings.speechToText,
          openaiIdFallback: updateSettings.openaiIdFallback,
          ignoreJids: updateSettings.ignoreJids,
          splitMessages: updateSettings.splitMessages,
          timePerChar: updateSettings.timePerChar,
        };
      }

      this.logger.debug('[settings] -> Criando novas configurações...');
      const newSetttings = await this.settingsRepository.create({
        data: {
          openaiCredsId: data.openaiCredsId,
          expire: data.expire,
          keywordFinish: data.keywordFinish,
          delayMessage: data.delayMessage,
          unknownMessage: data.unknownMessage,
          listeningFromMe: data.listeningFromMe,
          stopBotFromMe: data.stopBotFromMe,
          keepOpen: data.keepOpen,
          debounceTime: data.debounceTime,
          openaiIdFallback: data.openaiIdFallback,
          ignoreJids: data.ignoreJids,
          speechToText: data.speechToText,
          instanceId: instanceId,
          splitMessages: data.splitMessages,
          timePerChar: data.timePerChar,
        },
      });

      this.logger.debug(`[settings] -> Novas configurações criadas: ${JSON.stringify(newSetttings)}`);
      return {
        openaiCredsId: newSetttings.openaiCredsId,
        expire: newSetttings.expire,
        keywordFinish: newSetttings.keywordFinish,
        delayMessage: newSetttings.delayMessage,
        unknownMessage: newSetttings.unknownMessage,
        listeningFromMe: newSetttings.listeningFromMe,
        stopBotFromMe: newSetttings.stopBotFromMe,
        keepOpen: newSetttings.keepOpen,
        debounceTime: newSetttings.debounceTime,
        openaiIdFallback: newSetttings.openaiIdFallback,
        ignoreJids: newSetttings.ignoreJids,
        speechToText: newSetttings.speechToText,
        splitMessages: newSetttings.splitMessages,
        timePerChar: newSetttings.timePerChar,
      };
    } catch (error) {
      this.logger.error(`[settings] -> Erro ao criar/atualizar configurações: ${error}`);
      throw new Error('Error setting default settings');
    }
  }

  public async fetchSettings(instance: InstanceDto) {
    this.logger.debug(`[fetchSettings] -> Iniciando método com instance: ${JSON.stringify(instance)}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[fetchSettings] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = (
        await this.prismaRepository.instance.findFirst({
          select: { id: true },
          where: {
            name: instance.instanceName,
          },
        })
      )?.id;

      this.logger.debug(`[fetchSettings] -> Buscando configurações com instanceId: ${instanceId}`);
      const settings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
        include: {
          Fallback: true,
        },
      });

      if (!settings) {
        this.logger.debug('[fetchSettings] -> Nenhuma configuração encontrada, retornando padrão vazio.');
        return {
          openaiCredsId: null,
          expire: 0,
          keywordFinish: '',
          delayMessage: 0,
          unknownMessage: '',
          listeningFromMe: false,
          stopBotFromMe: false,
          keepOpen: false,
          ignoreJids: [],
          splitMessages: false,
          timePerChar: 0,
          openaiIdFallback: null,
          speechToText: false,
          fallback: null,
        };
      }

      this.logger.debug(`[fetchSettings] -> Configurações encontradas: ${JSON.stringify(settings)}`);
      return {
        openaiCredsId: settings.openaiCredsId,
        expire: settings.expire,
        keywordFinish: settings.keywordFinish,
        delayMessage: settings.delayMessage,
        unknownMessage: settings.unknownMessage,
        listeningFromMe: settings.listeningFromMe,
        stopBotFromMe: settings.stopBotFromMe,
        keepOpen: settings.keepOpen,
        ignoreJids: settings.ignoreJids,
        splitMessages: settings.splitMessages,
        timePerChar: settings.timePerChar,
        openaiIdFallback: settings.openaiIdFallback,
        speechToText: settings.speechToText,
        fallback: settings.Fallback,
      };
    } catch (error) {
      this.logger.error(`[fetchSettings] -> Erro ao buscar configurações: ${error}`);
      throw new Error('Error fetching default settings');
    }
  }

  // Sessions
  public async changeStatus(instance: InstanceDto, data: any) {
    this.logger.debug(`[changeStatus] -> Iniciando método com instance: ${JSON.stringify(instance)} e data: ${JSON.stringify(data)}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[changeStatus] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[changeStatus] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      const defaultSettingCheck = await this.settingsRepository.findFirst({
        where: {
          instanceId,
        },
      });

      const remoteJid = data.remoteJid;
      const status = data.status;

      this.logger.debug(`[changeStatus] -> remoteJid: ${remoteJid}, status: ${status}`);

      if (status === 'delete') {
        this.logger.debug('[changeStatus] -> Deletando todas as sessões para este remoteJid...');
        await this.sessionRepository.deleteMany({
          where: {
            remoteJid: remoteJid,
            botId: { not: null },
          },
        });

        this.logger.debug('[changeStatus] -> Sessões deletadas com sucesso.');
        return { openai: { remoteJid: remoteJid, status: status } };
      }

      if (status === 'closed') {
        if (defaultSettingCheck?.keepOpen) {
          this.logger.debug('[changeStatus] -> Configuração keepOpen habilitada, definindo status=closed para as sessões...');
          await this.sessionRepository.updateMany({
            where: {
              remoteJid: remoteJid,
              botId: { not: null },
              status: { not: 'closed' },
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          this.logger.debug('[changeStatus] -> keepOpen desabilitado, deletando sessões...');
          await this.sessionRepository.deleteMany({
            where: {
              remoteJid: remoteJid,
            },
          });
        }

        this.logger.debug('[changeStatus] -> Sessões tratadas com sucesso.');
        return { openai: { ...instance, openai: { remoteJid: remoteJid, status: status } } };
      } else {
        this.logger.debug('[changeStatus] -> Atualizando status das sessões existentes...');
        const session = await this.sessionRepository.updateMany({
          where: {
            instanceId: instanceId,
            remoteJid: remoteJid,
            botId: { not: null },
          },
          data: {
            status: status,
          },
        });

        const openaiData = {
          remoteJid: remoteJid,
          status: status,
          session,
        };

        this.logger.debug(`[changeStatus] -> Sessão atualizada com sucesso: ${JSON.stringify(openaiData)}`);
        return { openai: { ...instance, openai: openaiData } };
      }
    } catch (error) {
      this.logger.error(`[changeStatus] -> Erro ao alterar status: ${error}`);
      throw new Error('Error changing status');
    }
  }

  public async fetchSessions(instance: InstanceDto, botId: string, remoteJid?: string) {
    this.logger.debug(`[fetchSessions] -> Iniciando método com instance: ${JSON.stringify(instance)}, botId: ${botId}, remoteJid: ${remoteJid}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[fetchSessions] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[fetchSessions] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      const openaiBot = await this.botRepository.findFirst({
        where: {
          id: botId,
        },
      });

      if (openaiBot && openaiBot.instanceId !== instanceId) {
        this.logger.warn('[fetchSessions] -> Bot não pertence a esta instância.');
        throw new Error('Openai Bot not found');
      }

      this.logger.debug('[fetchSessions] -> Buscando sessões no banco...');
      const sessions = await this.sessionRepository.findMany({
        where: {
          instanceId: instanceId,
          remoteJid,
          botId: openaiBot ? botId : { not: null },
          type: 'openai',
        },
      });

      this.logger.debug(`[fetchSessions] -> Sessões encontradas: ${JSON.stringify(sessions)}`);
      return sessions;
    } catch (error) {
      this.logger.error(`[fetchSessions] -> Erro ao buscar sessões: ${error}`);
      throw new Error('Error fetching sessions');
    }
  }

  public async ignoreJid(instance: InstanceDto, data: IgnoreJidDto) {
    this.logger.debug(`[ignoreJid] -> Iniciando método com instance: ${JSON.stringify(instance)}, data: ${JSON.stringify(data)}`);
    if (!this.integrationEnabled) {
      this.logger.warn('[ignoreJid] -> OpenAI está desabilitado, lançando exceção.');
      throw new BadRequestException('Openai is disabled');
    }

    try {
      const instanceId = await this.prismaRepository.instance
        .findFirst({
          where: {
            name: instance.instanceName,
          },
        })
        .then((inst) => {
          this.logger.debug(`[ignoreJid] -> instanceId obtido: ${inst?.id}`);
          return inst.id;
        });

      const settings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instanceId,
        },
      });

      if (!settings) {
        this.logger.warn('[ignoreJid] -> Configurações não encontradas para esta instância.');
        throw new Error('Settings not found');
      }

      let ignoreJids: any = settings?.ignoreJids || [];

      if (data.action === 'add') {
        this.logger.debug('[ignoreJid] -> Adicionando remoteJid à lista de ignorados...');
        if (ignoreJids.includes(data.remoteJid)) {
          this.logger.debug('[ignoreJid] -> Jid já está na lista de ignorados.');
          return { ignoreJids: ignoreJids };
        }

        ignoreJids.push(data.remoteJid);
      } else {
        this.logger.debug('[ignoreJid] -> Removendo remoteJid da lista de ignorados...');
        ignoreJids = ignoreJids.filter((jid: string) => jid !== data.remoteJid);
      }

      this.logger.debug('[ignoreJid] -> Atualizando configurações no banco...');
      const updateSettings = await this.settingsRepository.update({
        where: {
          id: settings.id,
        },
        data: {
          ignoreJids: ignoreJids,
        },
      });

      this.logger.debug(`[ignoreJid] -> ignoreJids atualizada: ${JSON.stringify(updateSettings.ignoreJids)}`);
      return {
        ignoreJids: updateSettings.ignoreJids,
      };
    } catch (error) {
      this.logger.error(`[ignoreJid] -> Erro ao alterar lista de ignorados: ${error}`);
      throw new Error('Error setting default settings');
    }
  }

  // Emit
  public async emit({ instance, remoteJid, msg, pushName }: EmitData) {
    this.logger.debug(`[emit] -> Iniciando método com instance: ${JSON.stringify(instance)}, remoteJid: ${remoteJid}, msg: ${JSON.stringify(msg)}, pushName: ${pushName}`);
    if (!this.integrationEnabled) {
      this.logger.debug('[emit] -> OpenAI está desabilitado, encerrando execução.');
      return;
    }

    try {
      this.logger.debug('[emit] -> Buscando configurações da instância...');
      const settings = await this.settingsRepository.findFirst({
        where: {
          instanceId: instance.instanceId,
        },
      });

      if (this.checkIgnoreJids(settings?.ignoreJids, remoteJid)) {
        this.logger.debug(`[emit] -> remoteJid ${remoteJid} está na lista de ignorados, encerrando execução.`);
        return;
      }

      this.logger.debug('[emit] -> Buscando sessão atual do remoteJid...');
      let session = await this.getSession(remoteJid, instance);

      const content = getConversationMessage(msg);
      this.logger.debug(`[emit] -> Conteúdo da mensagem: ${content}`);

      this.logger.debug('[emit] -> Verificando se existe bot que atenda ao trigger...');
      let findBot = (await this.findBotTrigger(
        this.botRepository,
        this.settingsRepository,
        content,
        instance,
        session,
      )) as OpenaiBot;

      if (!findBot) {
        this.logger.debug('[emit] -> Nenhum bot encontrado pelo trigger, checando fallback...');
        const fallback = await this.settingsRepository.findFirst({
          where: {
            instanceId: instance.instanceId,
          },
        });

        if (fallback?.openaiIdFallback) {
          this.logger.debug(`[emit] -> Fallback ID encontrado: ${fallback.openaiIdFallback}, tentando buscar bot fallback...`);
          const findFallback = await this.botRepository.findFirst({
            where: {
              id: fallback.openaiIdFallback,
            },
          });

          findBot = findFallback;
        } else {
          this.logger.debug('[emit] -> Nenhum fallback configurado, encerrando execução.');
          return;
        }
      }

      let {
        expire,
        keywordFinish,
        delayMessage,
        unknownMessage,
        listeningFromMe,
        stopBotFromMe,
        keepOpen,
        debounceTime,
        ignoreJids,
        splitMessages,
        timePerChar,
      } = findBot;

      if (expire === undefined || expire === null) expire = settings?.expire;
      if (keywordFinish === undefined || keywordFinish === null) keywordFinish = settings?.keywordFinish;
      if (delayMessage === undefined || delayMessage === null) delayMessage = settings?.delayMessage;
      if (unknownMessage === undefined || unknownMessage === null) unknownMessage = settings?.unknownMessage;
      if (listeningFromMe === undefined || listeningFromMe === null) listeningFromMe = settings?.listeningFromMe;
      if (stopBotFromMe === undefined || stopBotFromMe === null) stopBotFromMe = settings?.stopBotFromMe;
      if (keepOpen === undefined || keepOpen === null) keepOpen = settings?.keepOpen;
      if (debounceTime === undefined || debounceTime === null) debounceTime = settings?.debounceTime;
      if (ignoreJids === undefined || ignoreJids === null) ignoreJids = settings?.ignoreJids;
      if (splitMessages === undefined || splitMessages === null) splitMessages = settings?.splitMessages ?? false;
      if (timePerChar === undefined || timePerChar === null) timePerChar = settings?.timePerChar ?? 0;

      const key = msg.key as {
        id: string;
        remoteJid: string;
        fromMe: boolean;
        participant: string;
      };

      if (stopBotFromMe && key.fromMe && session) {
        this.logger.debug('[emit] -> Bot deve parar caso a mensagem venha de mim, atualizando status da sessão para "paused"...');
        session = await this.sessionRepository.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'paused',
          },
        });
      }

      if (!listeningFromMe && key.fromMe) {
        this.logger.debug('[emit] -> Bot não responde mensagens enviadas de mim, encerrando execução.');
        return;
      }

      if (session && !session.awaitUser) {
        this.logger.debug('[emit] -> Sessão existente, mas session.awaitUser é false, encerrando execução.');
        return;
      }

      if (debounceTime && debounceTime > 0) {
        this.logger.debug('[emit] -> Iniciando lógica de debounce...');
        this.processDebounce(this.userMessageDebounce, content, remoteJid, debounceTime, async (debouncedContent) => {
          this.logger.debug(`[emit - Debounce] -> Chamando serviço OpenAI com debouncedContent: ${debouncedContent}`);

          if (findBot.botType === 'assistant') {
            this.logger.debug('[emit - Debounce] -> Bot é do tipo "assistant", chamando processOpenaiAssistant...');
            await this.openaiService.processOpenaiAssistant(
              this.waMonitor.waInstances[instance.instanceName],
              remoteJid,
              pushName,
              key.fromMe,
              findBot,
              session,
              {
                ...settings,
                expire,
                keywordFinish,
                delayMessage,
                unknownMessage,
                listeningFromMe,
                stopBotFromMe,
                keepOpen,
                debounceTime,
                ignoreJids,
                splitMessages,
                timePerChar,
              },
              debouncedContent,
            );
          }

          if (findBot.botType === 'chatCompletion') {
            this.logger.debug('[emit - Debounce] -> Bot é do tipo "chatCompletion", chamando processOpenaiChatCompletion...');
            await this.openaiService.processOpenaiChatCompletion(
              this.waMonitor.waInstances[instance.instanceName],
              remoteJid,
              pushName,
              findBot,
              session,
              {
                ...settings,
                expire,
                keywordFinish,
                delayMessage,
                unknownMessage,
                listeningFromMe,
                stopBotFromMe,
                keepOpen,
                debounceTime,
                ignoreJids,
                splitMessages,
                timePerChar,
              },
              debouncedContent,
            );
          }
        });
      } else {
        this.logger.debug('[emit] -> Sem debounce, chamando serviço OpenAI imediatamente...');

        if (findBot.botType === 'assistant') {
          this.logger.debug('[emit] -> Bot é do tipo "assistant", chamando processOpenaiAssistant...');
          await this.openaiService.processOpenaiAssistant(
            this.waMonitor.waInstances[instance.instanceName],
            remoteJid,
            pushName,
            key.fromMe,
            findBot,
            session,
            settings,
            content,
          );
        }

        if (findBot.botType === 'chatCompletion') {
          this.logger.debug('[emit] -> Bot é do tipo "chatCompletion", chamando processOpenaiChatCompletion...');
          await this.openaiService.processOpenaiChatCompletion(
            this.waMonitor.waInstances[instance.instanceName],
            remoteJid,
            pushName,
            findBot,
            session,
            settings,
            content,
          );
        }
      }

      this.logger.debug('[emit] -> Execução finalizada com sucesso.');
      return;
    } catch (error) {
      this.logger.error(`[emit] -> Erro geral no fluxo: ${error}`);
      return;
    }
  }
}
