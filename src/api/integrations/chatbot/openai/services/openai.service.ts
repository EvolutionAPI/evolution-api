/* eslint-disable @typescript-eslint/no-unused-vars */
import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { ConfigService, Language } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { IntegrationSession, OpenaiBot, OpenaiCreds, OpenaiSetting } from '@prisma/client';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';
import { downloadMediaMessage } from 'baileys';
import FormData from 'form-data';
import OpenAI from 'openai';
import P from 'pino';

export class OpenaiService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  private client: OpenAI;

  private readonly logger = new Logger('OpenaiService');

  private async sendMessageToBot(instance: any, openaiBot: OpenaiBot, remoteJid: string, content: string) {
    this.logger.debug('Enviando mensagem para o bot (sendMessageToBot).');
    this.logger.debug(`RemoteJid: ${remoteJid}, Content: ${content}`);

    const systemMessages: any = openaiBot.systemMessages;
    this.logger.debug(`SystemMessages recuperadas: ${systemMessages}`);

    const messagesSystem: any[] = systemMessages.map((message) => {
      return {
        role: 'system',
        content: message,
      };
    });

    const assistantMessages: any = openaiBot.assistantMessages;
    this.logger.debug(`AssistantMessages recuperadas: ${assistantMessages}`);

    const messagesAssistant: any[] = assistantMessages.map((message) => {
      return {
        role: 'assistant',
        content: message,
      };
    });

    const userMessages: any = openaiBot.userMessages;
    this.logger.debug(`UserMessages recuperadas: ${userMessages}`);

    const messagesUser: any[] = userMessages.map((message) => {
      return {
        role: 'user',
        content: message,
      };
    });

    const messageData: any = {
      role: 'user',
      content: [{ type: 'text', text: content }],
    };

    if (this.isImageMessage(content)) {
      this.logger.debug('Identificada mensagem de imagem no texto.');
      const contentSplit = content.split('|');

      const url = contentSplit[1].split('?')[0];
      this.logger.debug(`URL da imagem extraída: ${url}`);

      messageData.content = [
        { type: 'text', text: contentSplit[2] || content },
        {
          type: 'image_url',
          image_url: {
            url: url,
          },
        },
      ];
    }

    const messages: any[] = [...messagesSystem, ...messagesAssistant, ...messagesUser, messageData];
    // o logo precisa formatar messages em joson
    this.logger.debug(`Mensagens que serão enviadas para a API da OpenAI: ${JSON.stringify(messages)}`);

    if (instance.integration === Integration.WHATSAPP_BAILEYS) {
      this.logger.debug('Atualizando presença para WHATSAPP_BAILEYS (composing).');
      await instance.client.presenceSubscribe(remoteJid);
      await instance.client.sendPresenceUpdate('composing', remoteJid);
    }

    this.logger.debug('Chamando a API da OpenAI (chat.completions.create).');
    const completions = await this.client.chat.completions.create({
      model: openaiBot.model,
      messages: messages,
      max_tokens: openaiBot.maxTokens,
    });

    if (instance.integration === Integration.WHATSAPP_BAILEYS) {
      this.logger.debug('Atualizando presença para WHATSAPP_BAILEYS (paused).');
      await instance.client.sendPresenceUpdate('paused', remoteJid);
    }

    const message = completions.choices[0].message.content;
    this.logger.debug(`Resposta obtida da OpenAI (sendMessageToBot): ${message}`);

    return message;
  }

  private async sendMessageToAssistant(
    instance: any,
    openaiBot: OpenaiBot,
    remoteJid: string,
    pushName: string,
    fromMe: boolean,
    content: string,
    threadId: string,
  ) {
    this.logger.debug('Enviando mensagem para o assistente (sendMessageToAssistant).');
    this.logger.debug(`RemoteJid: ${remoteJid}, ThreadId: ${threadId}, Content: ${content}`);

    const messageData: any = {
      role: fromMe ? 'assistant' : 'user',
      content: [{ type: 'text', text: content }],
    };

    if (this.isImageMessage(content)) {
      this.logger.debug('Identificada mensagem de imagem no texto para Assistant.');
      const contentSplit = content.split('|');

      const url = contentSplit[1].split('?')[0];
      this.logger.debug(`URL da imagem extraída: ${url}`);

      messageData.content = [
        { type: 'text', text: contentSplit[2] || content },
        {
          type: 'image_url',
          image_url: {
            url: url,
          },
        },
      ];
    }

    this.logger.debug('Criando mensagem no thread do Assistant.');
    await this.client.beta.threads.messages.create(threadId, messageData);

    if (fromMe) {
      this.logger.debug('Mensagem enviada foi do próprio bot (fromMe). Enviando Telemetry.');
      sendTelemetry('/message/sendText');
      return;
    }

    this.logger.debug('Iniciando corrida (run) do Assistant com ID do assistant configurado.');
    const runAssistant = await this.client.beta.threads.runs.create(threadId, {
      assistant_id: openaiBot.assistantId,
    });

    if (instance.integration === Integration.WHATSAPP_BAILEYS) {
      this.logger.debug('Atualizando presença para WHATSAPP_BAILEYS (composing).');
      await instance.client.presenceSubscribe(remoteJid);
      await instance.client.sendPresenceUpdate('composing', remoteJid);
    }

    this.logger.debug('Aguardando resposta do Assistant (getAIResponse).');
    const response = await this.getAIResponse(threadId, runAssistant.id, openaiBot.functionUrl, remoteJid, pushName);

    if (instance.integration === Integration.WHATSAPP_BAILEYS) {
      this.logger.debug('Atualizando presença para WHATSAPP_BAILEYS (paused).');
      await instance.client.sendPresenceUpdate('paused', remoteJid);
    }

    const message = response?.data[0].content[0].text.value;
    this.logger.debug(`Resposta obtida do Assistant (sendMessageToAssistant): ${message}`);

    return message;
  }

  private async sendMessageWhatsapp(
    instance: any,
    session: IntegrationSession,
    remoteJid: string,
    settings: OpenaiSetting,
    message: string,
  ) {
    this.logger.debug('Enviando mensagem para o WhatsApp (sendMessageWhatsapp).');
    this.logger.debug(`RemoteJid: ${remoteJid}, Mensagem: ${message}`);

    const linkRegex = /(!?)\[(.*?)\]\((.*?)\)/g;
    let textBuffer = '';
    let lastIndex = 0;

    let match: RegExpExecArray | null;

    const getMediaType = (url: string): string | null => {
      const extension = url.split('.').pop()?.toLowerCase();
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
      const audioExtensions = ['mp3', 'wav', 'aac', 'ogg'];
      const videoExtensions = ['mp4', 'avi', 'mkv', 'mov'];
      const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];

      if (imageExtensions.includes(extension || '')) return 'image';
      if (audioExtensions.includes(extension || '')) return 'audio';
      if (videoExtensions.includes(extension || '')) return 'video';
      if (documentExtensions.includes(extension || '')) return 'document';
      return null;
    };

    // Processa links (ou mídia) dentro do texto
    this.logger.debug('Verificando se a mensagem contém mídia (links) no formato [altText](url).');
    while ((match = linkRegex.exec(message)) !== null) {
      const [fullMatch, exclMark, altText, url] = match;
      this.logger.debug(`Match encontrado: ${fullMatch}, url: ${url}, altText: ${altText}`);
      const mediaType = getMediaType(url);

      const beforeText = message.slice(lastIndex, match.index);
      if (beforeText) {
        textBuffer += beforeText;
      }

      if (mediaType) {
        const splitMessages = settings.splitMessages ?? false;
        const timePerChar = settings.timePerChar ?? 0;
        const minDelay = 1000;
        const maxDelay = 20000;

        // Envia primeiro o texto que estiver no buffer
        if (textBuffer.trim()) {
          if (splitMessages) {
            const multipleMessages = textBuffer.trim().split('\n\n');

            for (let index = 0; index < multipleMessages.length; index++) {
              const message = multipleMessages[index];
              const delay = Math.min(Math.max(message.length * timePerChar, minDelay), maxDelay);

              if (instance.integration === Integration.WHATSAPP_BAILEYS) {
                this.logger.debug('Atualizando presença (composing) antes de enviar texto em partes.');
                await instance.client.presenceSubscribe(remoteJid);
                await instance.client.sendPresenceUpdate('composing', remoteJid);
              }

              await new Promise<void>((resolve) => {
                setTimeout(async () => {
                  this.logger.debug(`Enviando texto (splitMessage): ${message}`);
                  await instance.textMessage(
                    {
                      number: remoteJid.split('@')[0],
                      delay: settings?.delayMessage || 1000,
                      text: message,
                    },
                    false,
                  );
                  resolve();
                }, delay);
              });

              if (instance.integration === Integration.WHATSAPP_BAILEYS) {
                this.logger.debug('Atualizando presença (paused) após enviar parte do texto.');
                await instance.client.sendPresenceUpdate('paused', remoteJid);
              }
            }
          } else {
            this.logger.debug(`Enviando texto inteiro do buffer: ${textBuffer.trim()}`);
            await instance.textMessage(
              {
                number: remoteJid.split('@')[0],
                delay: settings?.delayMessage || 1000,
                text: textBuffer.trim(),
              },
              false,
            );
            textBuffer = '';
          }
        }

        this.logger.debug(`Identificado arquivo de mídia do tipo: ${mediaType}`);
        if (mediaType === 'audio') {
          this.logger.debug('Enviando arquivo de áudio para o WhatsApp.');
          await instance.audioWhatsapp({
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            audio: url,
            caption: altText,
          });
        } else {
          this.logger.debug('Enviando arquivo de mídia (imagem, vídeo ou documento) para o WhatsApp.');
          await instance.mediaMessage(
            {
              number: remoteJid.split('@')[0],
              delay: settings?.delayMessage || 1000,
              mediatype: mediaType,
              media: url,
              caption: altText,
            },
            null,
            false,
          );
        }
      } else {
        this.logger.debug('Não é um tipo de mídia suportado. Adicionando link no buffer de texto.');
        textBuffer += `[${altText}](${url})`;
      }

      lastIndex = linkRegex.lastIndex;
    }

    // Processa o texto restante, caso exista
    if (lastIndex < message.length) {
      const remainingText = message.slice(lastIndex);
      if (remainingText.trim()) {
        textBuffer += remainingText;
      }
    }

    const splitMessages = settings.splitMessages ?? false;
    const timePerChar = settings.timePerChar ?? 0;
    const minDelay = 1000;
    const maxDelay = 20000;

    // Envia o que restou no textBuffer
    if (textBuffer.trim()) {
      if (splitMessages) {
        const multipleMessages = textBuffer.trim().split('\n\n');

        for (let index = 0; index < multipleMessages.length; index++) {
          const message = multipleMessages[index];
          const delay = Math.min(Math.max(message.length * timePerChar, minDelay), maxDelay);

          if (instance.integration === Integration.WHATSAPP_BAILEYS) {
            this.logger.debug('Atualizando presença (composing) antes de enviar resto do texto em partes.');
            await instance.client.presenceSubscribe(remoteJid);
            await instance.client.sendPresenceUpdate('composing', remoteJid);
          }

          await new Promise<void>((resolve) => {
            setTimeout(async () => {
              this.logger.debug(`Enviando texto (splitMessage): ${message}`);
              await instance.textMessage(
                {
                  number: remoteJid.split('@')[0],
                  delay: settings?.delayMessage || 1000,
                  text: message,
                },
                false,
              );
              resolve();
            }, delay);
          });

          if (instance.integration === Integration.WHATSAPP_BAILEYS) {
            this.logger.debug('Atualizando presença (paused) após enviar parte final do texto.');
            await instance.client.sendPresenceUpdate('paused', remoteJid);
          }
        }
      } else {
        this.logger.debug(`Enviando todo o texto restante no buffer: ${textBuffer.trim()}`);
        await instance.textMessage(
          {
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            text: textBuffer.trim(),
          },
          false,
        );
        textBuffer = '';
      }
    }

    this.logger.debug('Enviando telemetria após envio de texto.');
    sendTelemetry('/message/sendText');

    this.logger.debug(`Atualizando sessão (id: ${session.id}) para 'opened' e 'awaitUser: true'.`);
    await this.prismaRepository.integrationSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: 'opened',
        awaitUser: true,
      },
    });
  }

  public async createAssistantNewSession(instance: InstanceDto, data: any) {
    this.logger.debug('Iniciando criação de nova sessão do Assistant (createAssistantNewSession).');
    this.logger.debug(`Dados recebidos: ${JSON.stringify(data)}`);

    if (data.remoteJid === 'status@broadcast') {
      this.logger.debug('remoteJid é status@broadcast, abortando criação de sessão.');
      return;
    }

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: data.openaiCredsId,
      },
    });

    if (!creds) {
      this.logger.error('Openai Creds não encontrados, lançando erro.');
      throw new Error('Openai Creds not found');
    }

    try {
      this.logger.debug('Instanciando cliente OpenAI para Assistant.');
      this.client = new OpenAI({
        apiKey: creds.apiKey,
      });

      this.logger.debug('Criando thread (beta.threads.create).');
      const thread = await this.client.beta.threads.create({});
      const threadId = thread.id;

      let session = null;
      if (threadId) {
        this.logger.debug('Thread criada com sucesso. Salvando sessão no banco de dados.');
        session = await this.prismaRepository.integrationSession.create({
          data: {
            remoteJid: data.remoteJid,
            pushName: data.pushName,
            sessionId: threadId,
            status: 'opened',
            awaitUser: false,
            botId: data.botId,
            instanceId: instance.instanceId,
            type: 'openai',
          },
        });
      }
      return { session };
    } catch (error) {
      this.logger.error(`Erro ao criar nova sessão do Assistant: ${error}`);
      return;
    }
  }

  private async initAssistantNewSession(
    instance: any,
    remoteJid: string,
    pushName: string,
    fromMe: boolean,
    openaiBot: OpenaiBot,
    settings: OpenaiSetting,
    session: IntegrationSession,
    content: string,
  ) {
    this.logger.debug('Iniciando sessão do Assistant (initAssistantNewSession).');
    this.logger.debug(`RemoteJid: ${remoteJid}, PushName: ${pushName}, Content: ${content}`);

    const data = await this.createAssistantNewSession(instance, {
      remoteJid,
      pushName,
      openaiCredsId: openaiBot.openaiCredsId,
      botId: openaiBot.id,
    });

    if (data.session) {
      session = data.session;
      this.logger.debug(`Sessão criada com sucesso. ID: ${session.id}`);
    }

    this.logger.debug('Enviando mensagem para Assistant para iniciar conversa.');
    const message = await this.sendMessageToAssistant(
      instance,
      openaiBot,
      remoteJid,
      pushName,
      fromMe,
      content,
      session.sessionId,
    );

    this.logger.debug(`Retorno do Assistant: ${message}`);
    if (message) {
      this.logger.debug('Enviando mensagem do Assistant para WhatsApp.');
      await this.sendMessageWhatsapp(instance, session, remoteJid, settings, message);
    }

    return;
  }

  private isJSON(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  private async getAIResponse(
    threadId: string,
    runId: string,
    functionUrl: string,
    remoteJid: string,
    pushName: string,
  ) {
    this.logger.debug(`Consultando run do Assistant (getAIResponse). ThreadId: ${threadId}, RunId: ${runId}`);
    const getRun = await this.client.beta.threads.runs.retrieve(threadId, runId);
    let toolCalls;
    switch (getRun.status) {
      case 'requires_action':
        this.logger.debug('Run requer ação (requires_action). Verificando chamadas de ferramenta (tool_calls).');
        toolCalls = getRun?.required_action?.submit_tool_outputs?.tool_calls;

        if (toolCalls) {
          for (const toolCall of toolCalls) {
            const id = toolCall.id;
            const functionName = toolCall?.function?.name;
            const functionArgument = this.isJSON(toolCall?.function?.arguments)
              ? JSON.parse(toolCall?.function?.arguments)
              : toolCall?.function?.arguments;

            let output = null;
            this.logger.debug(`Chamando função externa: ${functionName} com argumentos:`, functionArgument);

            try {
              const { data } = await axios.post(functionUrl, {
                name: functionName,
                arguments: { ...functionArgument, remoteJid, pushName },
              });

              // Serializa saída para string
              output = JSON.stringify(data)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');
              this.logger.debug(`Resposta da função externa (${functionName}):`, data);
            } catch (error) {
              this.logger.error(`Erro ao chamar função externa (${functionName}):`, error);
              output = JSON.stringify(error)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');
            }

            this.logger.debug('Submetendo output para a run do Assistant (submitToolOutputs).');
            await this.client.beta.threads.runs.submitToolOutputs(threadId, runId, {
              tool_outputs: [
                {
                  tool_call_id: id,
                  output,
                },
              ],
            });
          }
        }

        this.logger.debug('Repetindo chamada getAIResponse até status diferente de requires_action.');
        return this.getAIResponse(threadId, runId, functionUrl, remoteJid, pushName);
      case 'queued':
        this.logger.debug('Run está em fila (queued). Aguardando 1 segundo antes de tentar novamente.');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getAIResponse(threadId, runId, functionUrl, remoteJid, pushName);
      case 'in_progress':
        this.logger.debug('Run está em progresso (in_progress). Aguardando 1 segundo antes de tentar novamente.');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getAIResponse(threadId, runId, functionUrl, remoteJid, pushName);
      case 'completed':
        this.logger.debug('Run concluída (completed). Recuperando última mensagem.');
        return await this.client.beta.threads.messages.list(threadId, {
          run_id: runId,
          limit: 1,
        });
    }
  }

  private isImageMessage(content: string) {
    return content.includes('imageMessage');
  }

  public async processOpenaiAssistant(
    instance: any,
    remoteJid: string,
    pushName: string,
    fromMe: boolean,
    openaiBot: OpenaiBot,
    session: IntegrationSession,
    settings: OpenaiSetting,
    content: string,
  ) {
    this.logger.debug('Processando mensagem para o Assistant (processOpenaiAssistant).');
    this.logger.debug(
      `RemoteJid: ${remoteJid}, pushName: ${pushName}, fromMe: ${fromMe}, content: ${content}`,
    );

    if (session && session.status === 'closed') {
      this.logger.debug('A sessão está fechada, não será processada.');
      return;
    }

    if (session && settings.expire && settings.expire > 0) {
      this.logger.debug('Verificando tempo de expiração da sessão...');
      const now = Date.now();
      const sessionUpdatedAt = new Date(session.updatedAt).getTime();
      const diff = now - sessionUpdatedAt;
      const diffInMinutes = Math.floor(diff / 1000 / 60);

      if (diffInMinutes > settings.expire) {
        this.logger.debug(`Sessão expirada há ${diffInMinutes} minutos.`);
        if (settings.keepOpen) {
          this.logger.debug('Atualizando status da sessão para CLOSED.');
          await this.prismaRepository.integrationSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          this.logger.debug('Deletando sessão do banco de dados.');
          await this.prismaRepository.integrationSession.deleteMany({
            where: {
              botId: openaiBot.id,
              remoteJid: remoteJid,
            },
          });
        }

        this.logger.debug('Recriando nova sessão de Assistant...');
        await this.initAssistantNewSession(
          instance,
          remoteJid,
          pushName,
          fromMe,
          openaiBot,
          settings,
          session,
          content,
        );
        return;
      }
    }

    if (!session) {
      this.logger.debug('Nenhuma sessão ativa encontrada, criando nova sessão de Assistant...');
      await this.initAssistantNewSession(instance, remoteJid, pushName, fromMe, openaiBot, settings, session, content);
      return;
    }

    if (session.status !== 'paused') {
      this.logger.debug('Marcando sessão como aberta e awaitUser = false.');
      await this.prismaRepository.integrationSession.update({
        where: {
          id: session.id,
        },
        data: {
          status: 'opened',
          awaitUser: false,
        },
      });
    }

    if (!content) {
      this.logger.debug('Não há conteúdo na mensagem. Verificando se existe unknownMessage para retorno.');
      if (settings.unknownMessage) {
        this.logger.debug(`Enviando unknownMessage para o remoteJid: ${remoteJid}`);
        this.waMonitor.waInstances[instance.instanceName].textMessage(
          {
            number: remoteJid.split('@')[0],
            delay: settings.delayMessage || 1000,
            text: settings.unknownMessage,
          },
          false,
        );
        sendTelemetry('/message/sendText');
      }
      return;
    }

    if (settings.keywordFinish && content.toLowerCase() === settings.keywordFinish.toLowerCase()) {
      this.logger.debug('Keyword finish detectada. Encerrando sessão.');
      if (settings.keepOpen) {
        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'closed',
          },
        });
      } else {
        await this.prismaRepository.integrationSession.deleteMany({
          where: {
            botId: openaiBot.id,
            remoteJid: remoteJid,
          },
        });
      }
      return;
    }

    this.logger.debug('Buscando OpenaiCreds no banco...');
    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: openaiBot.openaiCredsId,
      },
    });

    if (!creds) {
      this.logger.error('Openai Creds não encontrados, lançando erro.');
      throw new Error('Openai Creds not found');
    }

    this.logger.debug('Instanciando cliente OpenAI para processar a mensagem no Assistant.');
    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    const threadId = session.sessionId;
    this.logger.debug(`Enviando mensagem ao Assistant (threadId: ${threadId}).`);
    const message = await this.sendMessageToAssistant(
      instance,
      openaiBot,
      remoteJid,
      pushName,
      fromMe,
      content,
      threadId,
    );

    if (message) {
      this.logger.debug(`Resposta do Assistant recebida. Enviando para WhatsApp: ${message}`);
      await this.sendMessageWhatsapp(instance, session, remoteJid, settings, message);
    }

    return;
  }

  public async createChatCompletionNewSession(instance: InstanceDto, data: any) {
    this.logger.debug('Iniciando criação de nova sessão de chatCompletion (createChatCompletionNewSession).');
    this.logger.debug(`Dados recebidos: ${JSON.stringify(data)}`);

    if (data.remoteJid === 'status@broadcast') {
      this.logger.debug('remoteJid é status@broadcast, abortando criação de sessão.');
      return;
    }

    const id = Math.floor(Math.random() * 10000000000).toString();
    this.logger.debug(`Gerando ID pseudo-aleatório da sessão: ${id}`);

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: data.openaiCredsId,
      },
    });

    if (!creds) {
      this.logger.error('Openai Creds não encontrados, lançando erro.');
      throw new Error('Openai Creds not found');
    }

    try {
      this.logger.debug('Criando sessão no banco de dados.');
      const session = await this.prismaRepository.integrationSession.create({
        data: {
          remoteJid: data.remoteJid,
          pushName: data.pushName,
          sessionId: id,
          status: 'opened',
          awaitUser: false,
          botId: data.botId,
          instanceId: instance.instanceId,
          type: 'openai',
        },
      });

      return { session, creds };
    } catch (error) {
      this.logger.error(`Erro ao criar nova sessão de chatCompletion: ${error}`);
      return;
    }
  }

  private async initChatCompletionNewSession(
    instance: any,
    remoteJid: string,
    pushName: string,
    openaiBot: OpenaiBot,
    settings: OpenaiSetting,
    session: IntegrationSession,
    content: string,
  ) {
    this.logger.debug('Iniciando sessão de chatCompletion (initChatCompletionNewSession).');
    this.logger.debug(`RemoteJid: ${remoteJid}, PushName: ${pushName}, Content: ${content}`);

    const data = await this.createChatCompletionNewSession(instance, {
      remoteJid,
      pushName,
      openaiCredsId: openaiBot.openaiCredsId,
      botId: openaiBot.id,
    });

    session = data.session;
    const creds = data.creds;
    this.logger.debug(`Sessão criada com sucesso (ID: ${session.id}). Instanciando cliente OpenAI.`);

    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    this.logger.debug('Enviando mensagem para o Bot usando chatCompletion.');
    const message = await this.sendMessageToBot(instance, openaiBot, remoteJid, content);

    this.logger.debug(`Resposta do Bot: ${message}`);
    if (message) {
      this.logger.debug('Enviando resposta para o WhatsApp.');
      await this.sendMessageWhatsapp(instance, session, remoteJid, settings, message);
    }

    return;
  }

  public async processOpenaiChatCompletion(
    instance: any,
    remoteJid: string,
    pushName: string,
    openaiBot: OpenaiBot,
    session: IntegrationSession,
    settings: OpenaiSetting,
    content: string,
  ) {
    this.logger.debug('Processando ChatCompletion (processOpenaiChatCompletion).');
    this.logger.debug(
      `RemoteJid: ${remoteJid}, PushName: ${pushName}, Content: ${content}, SessionId: ${session?.id}`,
    );

    if (session && session.status !== 'opened') {
      this.logger.debug('Sessão existente não está aberta. Não será processado.');
      return;
    }

    if (session && settings.expire && settings.expire > 0) {
      this.logger.debug('Verificando tempo de expiração da sessão...');
      const now = Date.now();
      const sessionUpdatedAt = new Date(session.updatedAt).getTime();
      const diff = now - sessionUpdatedAt;
      const diffInMinutes = Math.floor(diff / 1000 / 60);

      if (diffInMinutes > settings.expire) {
        this.logger.debug(`Sessão expirada há ${diffInMinutes} minutos.`);
        if (settings.keepOpen) {
          this.logger.debug('Atualizando status da sessão para CLOSED.');
          await this.prismaRepository.integrationSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          this.logger.debug('Deletando sessão do banco de dados.');
          await this.prismaRepository.integrationSession.deleteMany({
            where: {
              botId: openaiBot.id,
              remoteJid: remoteJid,
            },
          });
        }

        this.logger.debug('Recriando nova sessão de chatCompletion...');
        await this.initChatCompletionNewSession(instance, remoteJid, pushName, openaiBot, settings, session, content);
        return;
      }
    }

    if (!session) {
      this.logger.debug('Nenhuma sessão encontrada. Criando nova sessão de chatCompletion...');
      await this.initChatCompletionNewSession(instance, remoteJid, pushName, openaiBot, settings, session, content);
      return;
    }

    this.logger.debug('Marcando sessão como aberta e awaitUser = false.');
    await this.prismaRepository.integrationSession.update({
      where: {
        id: session.id,
      },
      data: {
        status: 'opened',
        awaitUser: false,
      },
    });

    if (!content) {
      this.logger.debug('Não há conteúdo na mensagem. Verificando se existe unknownMessage para retorno.');
      if (settings.unknownMessage) {
        this.logger.debug(`Enviando unknownMessage para o remoteJid: ${remoteJid}`);
        this.waMonitor.waInstances[instance.instanceName].textMessage(
          {
            number: remoteJid.split('@')[0],
            delay: settings.delayMessage || 1000,
            text: settings.unknownMessage,
          },
          false,
        );
        sendTelemetry('/message/sendText');
      }
      return;
    }

    if (settings.keywordFinish && content.toLowerCase() === settings.keywordFinish.toLowerCase()) {
      this.logger.debug('Keyword finish detectada. Encerrando sessão.');
      if (settings.keepOpen) {
        await this.prismaRepository.integrationSession.update({
          where: {
            id: session.id,
          },
          data: {
            status: 'closed',
          },
        });
      } else {
        await this.prismaRepository.integrationSession.deleteMany({
          where: {
            botId: openaiBot.id,
            remoteJid: remoteJid,
          },
        });
      }
      return;
    }

    this.logger.debug('Buscando OpenaiCreds no banco...');
    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: openaiBot.openaiCredsId,
      },
    });

    if (!creds) {
      this.logger.error('Openai Creds não encontrados, lançando erro.');
      throw new Error('Openai Creds not found');
    }

    this.logger.debug('Instanciando cliente OpenAI para processar a mensagem (ChatCompletion).');
    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    this.logger.debug('Enviando mensagem para o Bot usando chatCompletion.');
    const message = await this.sendMessageToBot(instance, openaiBot, remoteJid, content);

    this.logger.debug(`Resposta do Bot: ${message}`);
    if (message) {
      this.logger.debug('Enviando resposta para o WhatsApp.');
      await this.sendMessageWhatsapp(instance, session, remoteJid, settings, message);
    }

    return;
  }

  public async speechToText(creds: OpenaiCreds, msg: any, updateMediaMessage: any) {
    this.logger.debug('Iniciando conversão de fala em texto (speechToText).');

    let audio;

    if (msg?.message?.mediaUrl) {
      this.logger.debug('Baixando áudio via URL (mediaUrl).');
      audio = await axios.get(msg.message.mediaUrl, { responseType: 'arraybuffer' }).then((response) => {
        return Buffer.from(response.data, 'binary');
      });
    } else {
      this.logger.debug('Baixando áudio via downloadMediaMessage (baileys).');
      audio = await downloadMediaMessage(
        { key: msg.key, message: msg?.message },
        'buffer',
        {},
        {
          logger: P({ level: 'error' }) as any,
          reuploadRequest: updateMediaMessage,
        },
      );
    }

    const lang = this.configService.get<Language>('LANGUAGE').includes('pt')
      ? 'pt'
      : this.configService.get<Language>('LANGUAGE');
    this.logger.debug(`Definindo idioma da transcrição como: ${lang}`);

    const formData = new FormData();
    formData.append('file', audio, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', lang);

    this.logger.debug('Enviando requisição POST para a API de transcrição do OpenAI.');
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${creds.apiKey}`,
      },
    });

    this.logger.debug(`Status da requisição: ${response.status}`);
    return response?.data?.text;
  }
}
