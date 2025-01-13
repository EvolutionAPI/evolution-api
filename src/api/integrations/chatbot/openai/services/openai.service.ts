/* eslint-disable @typescript-eslint/no-unused-vars */
import { InstanceDto } from '@api/dto/instance.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { ConfigService, Language } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { IntegrationSession, OpenaiBot, OpenaiCreds, OpenaiSetting, Message } from '@prisma/client';
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
    this.logger.debug('[sendMessageToBot] Enviando mensagem para o bot.');
    this.logger.debug(`[sendMessageToBot] RemoteJid: ${remoteJid}, Content: ${content}`);

    // System messages
    const systemMessages: any = openaiBot.systemMessages;
    this.logger.debug(`[sendMessageToBot] SystemMessages recuperadas: ${systemMessages}`);

    const messagesSystem: any[] = systemMessages.map((message) => {
      return {
        role: 'system',
        content: message,
      };
    });

    // Assistant messages
    const assistantMessages: any = openaiBot.assistantMessages;
    this.logger.debug(`[sendMessageToBot] AssistantMessages recuperadas: ${assistantMessages}`);
    
    const messagesAssistant: any[] = assistantMessages.map((message) => {
      return {
        role: 'assistant',
        content: message,
      };
    });

    // User messages
    const userMessages: any = openaiBot.userMessages;
    this.logger.debug(`[sendMessageToBot] UserMessages recuperadas: ${userMessages}`);

    const messagesUser: any[] = userMessages.map((message) => {
      return {
        role: 'user',
        content: message,
      };
    });

    // Imagem messages
    const messageData: any = {
      role: 'user',
      content: content,
    };

    if (this.isImageMessage(content)) {
      this.logger.debug('[sendMessageToBot] Identificada mensagem de imagem no texto.');
      const contentSplit = content.split('|');

      const url = contentSplit[1].split('?')[0];
      this.logger.debug(`[sendMessageToBot] URL da imagem extraída: ${url}`);

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

    // History Mensagens
    // Define aqui o limite máximo de caracteres do histórico
    const MAX_HISTORY_CHARS = 30000;

    /**
     * Extrai o texto principal de um objeto de mensagem.
     * @param msg Mensagem recebida do banco (tipo `Message`).
     * @returns Texto extraído da mensagem ou um JSON.stringify como fallback.
     */
    function extrairTextoDaMensagem(msg: Message): string {
      // Se não houver conteúdo
      if (!msg?.message) {
        return '';
      }

      // Caso seja mensagem de texto simples
      if (typeof msg.message === 'object' && 'conversation' in msg.message) {
        return String(msg.message.conversation);
      }

      // Caso seja extendedTextMessage
      if (typeof msg.message === 'object' && (msg.message as any)?.extendedTextMessage?.text) {
        if (typeof msg.message === 'object' && 'extendedTextMessage' in msg.message) {
          return (msg.message as any).extendedTextMessage.text;
        }
      }

      // Caso seja imagem com caption
      if (typeof msg.message === 'object' && 'imageMessage' in msg.message && (msg.message as any).imageMessage?.caption) {
        return (msg.message as any).imageMessage.caption;
      }

      // Fallback: retorna o objeto como JSON
      return JSON.stringify(msg.message);
    }

    let historyArray: any[] = [];

    if (remoteJid && remoteJid.startsWith('webwidget:')) {
      // Extrai o ID da conversa a partir do remoteJid (ex: 'webwidget:12345')
      const conversationId = remoteJid.split(':')[1] || '0';
      this.logger.debug(`[sendMessageToBot] RemoteJid é webwidget. Buscando histórico da conversa: ${conversationId}`);

      // Busca todas as mensagens, sem limite de quantidade
      let conversationHistory = await this.prismaRepository.message.findMany({
        where: {
          chatwootConversationId: parseInt(conversationId),
        },
        orderBy: {
          messageTimestamp: 'desc',
        },
      });
      this.logger.debug(`[sendMessageToBot] Histórico da conversa recuperado: ${conversationHistory.length} mensagens`);

      if (conversationHistory.length > 0) {
        // Inverte para ficar das mais antigas às mais recentes
        conversationHistory = conversationHistory.reverse();

        // Mapeia cada mensagem para uma linha (role + texto)
        let lines = conversationHistory.map((msg) => {
          const textoExtraido = extrairTextoDaMensagem(msg);
          // Se a mensagem for "fromMe", consideramos como 'assistant'; senão, 'user'
          const roleOpenAI = (msg.key as any)?.fromMe ? 'assistant' : 'user';
          return `${roleOpenAI}: ${textoExtraido}`;
        });

        // Monta o histórico inicial com todas as linhas
        let conversationString = lines.join('\n');

        // Se exceder o limite de caracteres, remover mensagens mais antigas
        while (conversationString.length > MAX_HISTORY_CHARS && lines.length > 0) {
          // Remove a primeira linha (mais antiga) do array
          lines.shift();
          conversationString = lines.join('\n');
        }

        historyArray = [
          {
            role: 'system',
            content: `This is the conversation history so far:\n\n${conversationString}`,
          }
        ];
      } else {
        // Caso não haja histórico
        historyArray = [
          {
            role: 'system',
            content: 'Não há histórico de conversa ainda.',
          }
        ];
      }

      this.logger.debug(`[sendMessageToBot] HistoryMessages: ${JSON.stringify(historyArray)}`);
    }

    // debug historyMessages
    this.logger.debug(`[sendMessageToBot] HistoryMessages: ${JSON.stringify(historyArray)}`);
    const messages: any[] = [...messagesSystem, ...messagesAssistant, ...messagesUser, ...historyArray, messageData];
    this.logger.debug(`[sendMessageToBot] Mensagens que serão enviadas para a API da OpenAI: ${JSON.stringify(messages)}`);

    if (instance.integration === Integration.WHATSAPP_BAILEYS) {
      this.logger.debug('[sendMessageToBot] Atualizando presença para WHATSAPP_BAILEYS (composing).');
      await instance.client.presenceSubscribe(remoteJid);
      await instance.client.sendPresenceUpdate('composing', remoteJid);
    }

    this.logger.debug('[sendMessageToBot] Chamando a API da OpenAI (chat.completions.create).');
    const completions = await this.client.chat.completions.create({
      model: openaiBot.model,
      messages: messages,
      max_tokens: openaiBot.maxTokens,
    });

    if (instance.integration === Integration.WHATSAPP_BAILEYS) {
      this.logger.debug('[sendMessageToBot] Atualizando presença para WHATSAPP_BAILEYS (paused).');
      await instance.client.sendPresenceUpdate('paused', remoteJid);
    }

    const message = completions.choices[0].message.content;
    this.logger.debug(`[sendMessageToBot] Resposta obtida da OpenAI: ${message}`);

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
    this.logger.debug('[sendMessageToAssistant] Enviando mensagem para o assistente.');
    this.logger.debug(`[sendMessageToAssistant] RemoteJid: ${remoteJid}, ThreadId: ${threadId}, Content: ${content}`);

    const messageData: any = {
      role: fromMe ? 'assistant' : 'user',
      content: [{ type: 'text', text: content }],
    };

    if (this.isImageMessage(content)) {
      this.logger.debug('[sendMessageToAssistant] Identificada mensagem de imagem no texto.');
      const contentSplit = content.split('|');

      const url = contentSplit[1].split('?')[0];
      this.logger.debug(`[sendMessageToAssistant] URL da imagem extraída: ${url}`);

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

    this.logger.debug('[sendMessageToAssistant] Criando mensagem no thread do Assistant.');
    await this.client.beta.threads.messages.create(threadId, messageData);

    if (fromMe) {
      this.logger.debug('[sendMessageToAssistant] Mensagem enviada foi do próprio bot (fromMe). Enviando Telemetry.');
      sendTelemetry('/message/sendText');
      return;
    }

    this.logger.debug('[sendMessageToAssistant] Iniciando corrida (run) do Assistant com ID do assistant configurado.');
    const runAssistant = await this.client.beta.threads.runs.create(threadId, {
      assistant_id: openaiBot.assistantId,
    });

    if (instance.integration === Integration.WHATSAPP_BAILEYS) {
      this.logger.debug('[sendMessageToAssistant] Atualizando presença para WHATSAPP_BAILEYS (composing).');
      await instance.client.presenceSubscribe(remoteJid);
      await instance.client.sendPresenceUpdate('composing', remoteJid);
    }

    this.logger.debug('[sendMessageToAssistant] Aguardando resposta do Assistant (getAIResponse).');
    const response = await this.getAIResponse(threadId, runAssistant.id, openaiBot.functionUrl, remoteJid, pushName);

    if (instance.integration === Integration.WHATSAPP_BAILEYS) {
      this.logger.debug('[sendMessageToAssistant] Atualizando presença para WHATSAPP_BAILEYS (paused).');
      await instance.client.sendPresenceUpdate('paused', remoteJid);
    }

    const message = response?.data[0].content[0].text.value;
    this.logger.debug(`[sendMessageToAssistant] Resposta obtida do Assistant: ${message}`);

    return message;
  }

  private async sendMessageWhatsapp(
    instance: any,
    session: IntegrationSession,
    remoteJid: string,
    settings: OpenaiSetting,
    message: string,
  ) {
    this.logger.debug('[sendMessageWhatsapp] Enviando mensagem para o WhatsApp.');
    this.logger.debug(`[sendMessageWhatsapp] RemoteJid: ${remoteJid}, Mensagem: ${message}`);

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
    this.logger.debug('[sendMessageWhatsapp] Verificando se a mensagem contém mídia (links) no formato [altText](url).');
    while ((match = linkRegex.exec(message)) !== null) {
      const [fullMatch, exclMark, altText, url] = match;
      this.logger.debug(`[sendMessageWhatsapp] Match encontrado: ${fullMatch}, url: ${url}, altText: ${altText}`);
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
                this.logger.debug('[sendMessageWhatsapp] Atualizando presença (composing) antes de enviar texto em partes.');
                await instance.client.presenceSubscribe(remoteJid);
                await instance.client.sendPresenceUpdate('composing', remoteJid);
              }

              await new Promise<void>((resolve) => {
                setTimeout(async () => {
                  this.logger.debug(`[sendMessageWhatsapp] Enviando texto (splitMessage)`);
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
                this.logger.debug('[sendMessageWhatsapp] Atualizando presença (paused) após enviar parte do texto.');
                await instance.client.sendPresenceUpdate('paused', remoteJid);
              }
            }
          } else {
            this.logger.debug(`[sendMessageWhatsapp] Enviando texto inteiro do buffer: ${textBuffer.trim()}`);
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

        this.logger.debug(`[sendMessageWhatsapp] Identificado arquivo de mídia do tipo: ${mediaType}`);
        if (mediaType === 'audio') {
          this.logger.debug('[sendMessageWhatsapp] Enviando arquivo de áudio para o WhatsApp.');
          await instance.audioWhatsapp({
            number: remoteJid.split('@')[0],
            delay: settings?.delayMessage || 1000,
            audio: url,
            caption: altText,
          });
        } else {
          this.logger.debug('[sendMessageWhatsapp] Enviando arquivo de mídia (imagem, vídeo ou documento) para o WhatsApp.');
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
        this.logger.debug('[sendMessageWhatsapp] Não é um tipo de mídia suportado. Adicionando link no buffer de texto.');
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
            this.logger.debug('[sendMessageWhatsapp] Atualizando presença (composing) antes de enviar resto do texto em partes.');
            await instance.client.presenceSubscribe(remoteJid);
            await instance.client.sendPresenceUpdate('composing', remoteJid);
          }

          await new Promise<void>((resolve) => {
            setTimeout(async () => {
              this.logger.debug(`[sendMessageWhatsapp] Enviando texto (splitMessage)`);
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
            this.logger.debug('[sendMessageWhatsapp] Atualizando presença (paused) após enviar parte final do texto.');
            await instance.client.sendPresenceUpdate('paused', remoteJid);
          }
        }
      } else {
        this.logger.debug(`[sendMessageWhatsapp] Enviando todo o texto restante no buffer: ${textBuffer.trim()}`);
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

    this.logger.debug('[sendMessageWhatsapp] Enviando telemetria após envio de texto.');
    sendTelemetry('/message/sendText');

    this.logger.debug(`[sendMessageWhatsapp] Atualizando sessão (id: ${session.id}) para 'opened' e 'awaitUser: true'.`);
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
    this.logger.debug('[createAssistantNewSession] Iniciando criação de nova sessão do Assistant.');
    this.logger.debug(`[createAssistantNewSession] Dados recebidos: ${JSON.stringify(data)}`);

    if (data.remoteJid === 'status@broadcast') {
      this.logger.debug('[createAssistantNewSession] remoteJid é status@broadcast, abortando criação de sessão.');
      return;
    }

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: data.openaiCredsId,
      },
    });

    if (!creds) {
      this.logger.error('[createAssistantNewSession] Openai Creds não encontrados, lançando erro.');
      throw new Error('Openai Creds not found');
    }

    try {
      this.logger.debug('[createAssistantNewSession] Instanciando cliente OpenAI para Assistant.');
      this.client = new OpenAI({
        apiKey: creds.apiKey,
      });

      this.logger.debug('[createAssistantNewSession] Criando thread (beta.threads.create).');
      const thread = await this.client.beta.threads.create({});
      const threadId = thread.id;

      let session = null;
      if (threadId) {
        this.logger.debug('[createAssistantNewSession] Thread criada com sucesso. Salvando sessão no banco de dados.');
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
      this.logger.error(`[createAssistantNewSession] Erro ao criar nova sessão do Assistant: ${error}`);
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
    this.logger.debug('[initAssistantNewSession] Iniciando sessão do Assistant.');
    this.logger.debug(`[initAssistantNewSession] RemoteJid: ${remoteJid}, PushName: ${pushName}, Content: ${content}`);

    const data = await this.createAssistantNewSession(instance, {
      remoteJid,
      pushName,
      openaiCredsId: openaiBot.openaiCredsId,
      botId: openaiBot.id,
    });

    if (data.session) {
      session = data.session;
      this.logger.debug(`[initAssistantNewSession] Sessão criada com sucesso. ID: ${session.id}`);
    }

    this.logger.debug('[initAssistantNewSession] Enviando mensagem para Assistant para iniciar conversa.');
    const message = await this.sendMessageToAssistant(
      instance,
      openaiBot,
      remoteJid,
      pushName,
      fromMe,
      content,
      session.sessionId,
    );

    this.logger.debug(`[initAssistantNewSession] Retorno do Assistant: ${message}`);
    if (message) {
      this.logger.debug('[initAssistantNewSession] Enviando mensagem do Assistant para WhatsApp.');
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
    this.logger.debug(`[getAIResponse] Consultando run do Assistant. ThreadId: ${threadId}, RunId: ${runId}`);
    const getRun = await this.client.beta.threads.runs.retrieve(threadId, runId);
    let toolCalls;
    switch (getRun.status) {
      case 'requires_action':
        this.logger.debug('[getAIResponse] Run requer ação. Verificando chamadas de ferramenta (tool_calls).');
        toolCalls = getRun?.required_action?.submit_tool_outputs?.tool_calls;

        if (toolCalls) {
          for (const toolCall of toolCalls) {
            const id = toolCall.id;
            const functionName = toolCall?.function?.name;
            const functionArgument = this.isJSON(toolCall?.function?.arguments)
              ? JSON.parse(toolCall?.function?.arguments)
              : toolCall?.function?.arguments;

            let output = null;
            this.logger.debug(`[getAIResponse] Chamando função externa: ${functionName} com argumentos:`, functionArgument);

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
              this.logger.debug(`[getAIResponse] Resposta da função externa (${functionName}):`, data);
            } catch (error) {
              this.logger.error(`[getAIResponse] Erro ao chamar função externa (${functionName}):`, error);
              output = JSON.stringify(error)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');
            }

            this.logger.debug('[getAIResponse] Submetendo output para a run do Assistant (submitToolOutputs).');
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

        this.logger.debug('[getAIResponse] Repetindo chamada getAIResponse até status diferente de requires_action.');
        return this.getAIResponse(threadId, runId, functionUrl, remoteJid, pushName);
      case 'queued':
        this.logger.debug('[getAIResponse] Run está em fila (queued). Aguardando 1 segundo antes de tentar novamente.');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getAIResponse(threadId, runId, functionUrl, remoteJid, pushName);
      case 'in_progress':
        this.logger.debug('[getAIResponse] Run está em progresso (in_progress). Aguardando 1 segundo antes de tentar novamente.');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getAIResponse(threadId, runId, functionUrl, remoteJid, pushName);
      case 'completed':
        this.logger.debug('[getAIResponse] Run concluída (completed). Recuperando última mensagem.');
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
    this.logger.debug('[processOpenaiAssistant] Processando mensagem para o Assistant.');
    this.logger.debug(
      `[processOpenaiAssistant] RemoteJid: ${remoteJid}, pushName: ${pushName}, fromMe: ${fromMe}, content: ${content}`,
    );

    if (session && session.status === 'closed') {
      this.logger.debug('[processOpenaiAssistant] A sessão está fechada, não será processada.');
      return;
    }

    if (session && settings.expire && settings.expire > 0) {
      this.logger.debug('[processOpenaiAssistant] Verificando tempo de expiração da sessão...');
      const now = Date.now();
      const sessionUpdatedAt = new Date(session.updatedAt).getTime();
      const diff = now - sessionUpdatedAt;
      const diffInMinutes = Math.floor(diff / 1000 / 60);

      if (diffInMinutes > settings.expire) {
        this.logger.debug(`[processOpenaiAssistant] Sessão expirada há ${diffInMinutes} minutos.`);
        if (settings.keepOpen) {
          this.logger.debug('[processOpenaiAssistant] Atualizando status da sessão para CLOSED.');
          await this.prismaRepository.integrationSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          this.logger.debug('[processOpenaiAssistant] Deletando sessão do banco de dados.');
          await this.prismaRepository.integrationSession.deleteMany({
            where: {
              botId: openaiBot.id,
              remoteJid: remoteJid,
            },
          });
        }

        this.logger.debug('[processOpenaiAssistant] Recriando nova sessão de Assistant...');
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
      this.logger.debug('[processOpenaiAssistant] Nenhuma sessão ativa encontrada, criando nova sessão de Assistant...');
      await this.initAssistantNewSession(instance, remoteJid, pushName, fromMe, openaiBot, settings, session, content);
      return;
    }

    if (session.status !== 'paused') {
      this.logger.debug('[processOpenaiAssistant] Marcando sessão como aberta e awaitUser = false.');
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
      this.logger.debug('[processOpenaiAssistant] Não há conteúdo na mensagem. Verificando se existe unknownMessage para retorno.');
      if (settings.unknownMessage) {
        this.logger.debug(`[processOpenaiAssistant] Enviando unknownMessage para o remoteJid: ${remoteJid}`);
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
      this.logger.debug('[processOpenaiAssistant] Keyword finish detectada. Encerrando sessão.');
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

    this.logger.debug('[processOpenaiAssistant] Buscando OpenaiCreds no banco...');
    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: openaiBot.openaiCredsId,
      },
    });

    if (!creds) {
      this.logger.error('[processOpenaiAssistant] Openai Creds não encontrados, lançando erro.');
      throw new Error('Openai Creds not found');
    }

    this.logger.debug('[processOpenaiAssistant] Instanciando cliente OpenAI para processar a mensagem no Assistant.');
    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    const threadId = session.sessionId;
    this.logger.debug(`[processOpenaiAssistant] Enviando mensagem ao Assistant (threadId: ${threadId}).`);
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
      this.logger.debug(`[processOpenaiAssistant] Resposta do Assistant recebida. Enviando para WhatsApp: ${message}`);
      await this.sendMessageWhatsapp(instance, session, remoteJid, settings, message);
    }

    return;
  }

  public async createChatCompletionNewSession(instance: InstanceDto, data: any) {
    this.logger.debug('[createChatCompletionNewSession] Iniciando criação de nova sessão de chatCompletion.');
    this.logger.debug(`[createChatCompletionNewSession] Dados recebidos: ${JSON.stringify(data)}`);

    if (data.remoteJid === 'status@broadcast') {
      this.logger.debug('[createChatCompletionNewSession] remoteJid é status@broadcast, abortando criação de sessão.');
      return;
    }

    const id = Math.floor(Math.random() * 10000000000).toString();
    this.logger.debug(`[createChatCompletionNewSession] Gerando ID pseudo-aleatório da sessão: ${id}`);

    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: data.openaiCredsId,
      },
    });

    if (!creds) {
      this.logger.error('[createChatCompletionNewSession] Openai Creds não encontrados, lançando erro.');
      throw new Error('Openai Creds not found');
    }

    try {
      this.logger.debug('[createChatCompletionNewSession] Criando sessão no banco de dados.');
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
      this.logger.error(`[createChatCompletionNewSession] Erro ao criar nova sessão de chatCompletion: ${error}`);
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
    this.logger.debug('[initChatCompletionNewSession] Iniciando sessão de chatCompletion.');
    this.logger.debug(`[initChatCompletionNewSession] RemoteJid: ${remoteJid}, PushName: ${pushName}, Content: ${content}`);

    const data = await this.createChatCompletionNewSession(instance, {
      remoteJid,
      pushName,
      openaiCredsId: openaiBot.openaiCredsId,
      botId: openaiBot.id,
    });

    session = data.session;
    const creds = data.creds;
    this.logger.debug(`[initChatCompletionNewSession] Sessão criada com sucesso (ID: ${session.id}). Instanciando cliente OpenAI.`);

    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    this.logger.debug('[initChatCompletionNewSession] Enviando mensagem para o Bot usando chatCompletion.');
    const message = await this.sendMessageToBot(instance, openaiBot, remoteJid, content);

    this.logger.debug(`[initChatCompletionNewSession] Resposta do Bot: ${message}`);
    if (message) {
      this.logger.debug('[initChatCompletionNewSession] Enviando resposta para o WhatsApp.');
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
      this.logger.debug('[processOpenaiChatCompletion] Sessão existente não está aberta. Não será processado.');
      return;
    }

    if (session && settings.expire && settings.expire > 0) {
      this.logger.debug('[processOpenaiChatCompletion] Verificando tempo de expiração da sessão...');
      const now = Date.now();
      const sessionUpdatedAt = new Date(session.updatedAt).getTime();
      const diff = now - sessionUpdatedAt;
      const diffInMinutes = Math.floor(diff / 1000 / 60);

      if (diffInMinutes > settings.expire) {
        this.logger.debug(`[processOpenaiChatCompletion] Sessão expirada há ${diffInMinutes} minutos.`);
        if (settings.keepOpen) {
          this.logger.debug('[processOpenaiChatCompletion] Atualizando status da sessão para CLOSED.');
          await this.prismaRepository.integrationSession.update({
            where: {
              id: session.id,
            },
            data: {
              status: 'closed',
            },
          });
        } else {
          this.logger.debug('[processOpenaiChatCompletion] Deletando sessão do banco de dados.');
          await this.prismaRepository.integrationSession.deleteMany({
            where: {
              botId: openaiBot.id,
              remoteJid: remoteJid,
            },
          });
        }

        this.logger.debug('[processOpenaiChatCompletion] Recriando nova sessão de chatCompletion...');
        await this.initChatCompletionNewSession(instance, remoteJid, pushName, openaiBot, settings, session, content);
        return;
      }
    }

    if (!session) {
      this.logger.debug('[processOpenaiChatCompletion] Nenhuma sessão encontrada. Criando nova sessão de chatCompletion...');
      await this.initChatCompletionNewSession(instance, remoteJid, pushName, openaiBot, settings, session, content);
      return;
    }

    this.logger.debug('[processOpenaiChatCompletion] Marcando sessão como aberta e awaitUser = false.');
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
      this.logger.debug('[processOpenaiChatCompletion] Não há conteúdo na mensagem. Verificando se existe unknownMessage para retorno.');
      if (settings.unknownMessage) {
        this.logger.debug(`[processOpenaiChatCompletion] Enviando unknownMessage para o remoteJid: ${remoteJid}`);
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
      this.logger.debug('[processOpenaiChatCompletion] Keyword finish detectada. Encerrando sessão.');
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

    this.logger.debug('[processOpenaiChatCompletion] Buscando OpenaiCreds no banco...');
    const creds = await this.prismaRepository.openaiCreds.findFirst({
      where: {
        id: openaiBot.openaiCredsId,
      },
    });

    if (!creds) {
      this.logger.error('[processOpenaiChatCompletion] Openai Creds não encontrados, lançando erro.');
      throw new Error('Openai Creds not found');
    }

    this.logger.debug('[processOpenaiChatCompletion] Instanciando cliente OpenAI para processar a mensagem (ChatCompletion).');
    this.client = new OpenAI({
      apiKey: creds.apiKey,
    });

    this.logger.debug('[processOpenaiChatCompletion] Enviando mensagem para o Bot usando chatCompletion.');
    const message = await this.sendMessageToBot(instance, openaiBot, remoteJid, content);

    this.logger.debug(`[processOpenaiChatCompletion] Resposta do Bot: ${message}`);
    if (message) {
      this.logger.debug('[processOpenaiChatCompletion] Enviando resposta para o WhatsApp.');
      await this.sendMessageWhatsapp(instance, session, remoteJid, settings, message);
    }

    return;
  }

  public async speechToText(creds: OpenaiCreds, msg: any, updateMediaMessage: any) {
    this.logger.debug('[speechToText] Iniciando conversão de fala em texto.');

    let audio;

    if (msg?.message?.mediaUrl) {
      this.logger.debug('[speechToText] Baixando áudio via URL (mediaUrl).');
      audio = await axios.get(msg.message.mediaUrl, { responseType: 'arraybuffer' }).then((response) => {
        return Buffer.from(response.data, 'binary');
      });
    } else {
      this.logger.debug('[speechToText] Baixando áudio via downloadMediaMessage (baileys).');
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
    this.logger.debug(`[speechToText] Definindo idioma da transcrição como: ${lang}`);

    const formData = new FormData();
    formData.append('file', audio, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', lang);

    this.logger.debug('[speechToText] Enviando requisição POST para a API de transcrição do OpenAI.');
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${creds.apiKey}`,
      },
    });

    this.logger.debug(`[speechToText] Status da requisição: ${response.status}`);
    return response?.data?.text;
  }
}
