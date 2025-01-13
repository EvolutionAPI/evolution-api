import { InstanceDto } from '@api/dto/instance.dto';
import { ProxyDto } from '@api/dto/proxy.dto';
import { SettingsDto } from '@api/dto/settings.dto';
import { ChatwootDto } from '@api/integrations/chatbot/chatwoot/dto/chatwoot.dto';
import { ChatwootService } from '@api/integrations/chatbot/chatwoot/services/chatwoot.service';
import { DifyService } from '@api/integrations/chatbot/dify/services/dify.service';
import { OpenaiService } from '@api/integrations/chatbot/openai/services/openai.service';
import { TypebotService } from '@api/integrations/chatbot/typebot/services/typebot.service';
import { PrismaRepository, Query } from '@api/repository/repository.service';
import { eventManager, waMonitor } from '@api/server.module';
import { Events, wa } from '@api/types/wa.types';
import { Auth, Chatwoot, ConfigService, HttpServer } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { NotFoundException } from '@exceptions';
import { Contact, Message } from '@prisma/client';
import { WASocket } from 'baileys';
import { isArray } from 'class-validator';
import EventEmitter2 from 'eventemitter2';
import { v4 } from 'uuid';

import { CacheService } from './cache.service';

export class ChannelStartupService {
  constructor(
    public readonly configService: ConfigService,
    public readonly eventEmitter: EventEmitter2,
    public readonly prismaRepository: PrismaRepository,
    public readonly chatwootCache: CacheService,
  ) {}

  public readonly logger = new Logger('ChannelStartupService');

  public client: WASocket;
  public readonly instance: wa.Instance = {};
  public readonly localChatwoot: wa.LocalChatwoot = {};
  public readonly localProxy: wa.LocalProxy = {};
  public readonly localSettings: wa.LocalSettings = {};
  public readonly localWebhook: wa.LocalWebHook = {};

  public chatwootService = new ChatwootService(
    waMonitor,
    this.configService,
    this.prismaRepository,
    this.chatwootCache,
  );

  public typebotService = new TypebotService(waMonitor, this.configService, this.prismaRepository);

  public openaiService = new OpenaiService(waMonitor, this.configService, this.prismaRepository);

  public difyService = new DifyService(waMonitor, this.configService, this.prismaRepository);

  public setInstance(instance: InstanceDto) {
    this.logger.debug(`[setInstance] Definindo dados da instância: ${JSON.stringify(instance)}`);
    this.logger.setInstance(instance.instanceName);

    this.instance.name = instance.instanceName;
    this.instance.id = instance.instanceId;
    this.instance.integration = instance.integration;
    this.instance.number = instance.number;
    this.instance.token = instance.token;
    this.instance.businessId = instance.businessId;

    if (this.configService.get<Chatwoot>('CHATWOOT').ENABLED && this.localChatwoot?.enabled) {
      this.logger.debug('[setInstance] Enviando evento de STATUS_INSTANCE para Chatwoot');
      this.chatwootService.eventWhatsapp(
        Events.STATUS_INSTANCE,
        { instanceName: this.instance.name },
        {
          instance: this.instance.name,
          status: 'created',
        },
      );
    }
  }

  public set instanceName(name: string) {
    this.logger.debug(`[setter instanceName] Atribuindo: ${name}`);
    this.logger.setInstance(name);

    if (!name) {
      this.instance.name = v4();
      return;
    }
    this.instance.name = name;
  }

  public get instanceName() {
    return this.instance.name;
  }

  public set instanceId(id: string) {
    this.logger.debug(`[setter instanceId] Atribuindo: ${id}`);
    if (!id) {
      this.instance.id = v4();
      return;
    }
    this.instance.id = id;
  }

  public get instanceId() {
    return this.instance.id;
  }

  public set integration(integration: string) {
    this.logger.debug(`[setter integration] Atribuindo: ${integration}`);
    this.instance.integration = integration;
  }

  public get integration() {
    return this.instance.integration;
  }

  public set number(number: string) {
    this.logger.debug(`[setter number] Atribuindo número: ${number}`);
    this.instance.number = number;
  }

  public get number() {
    return this.instance.number;
  }

  public set token(token: string) {
    this.logger.debug(`[setter token] Atribuindo token.`);
    this.instance.token = token;
  }

  public get token() {
    return this.instance.token;
  }

  public get wuid() {
    return this.instance.wuid;
  }

  public async loadWebhook() {
    this.logger.debug(`[loadWebhook] Carregando webhook para instanceId: ${this.instanceId}`);
    const data = await this.prismaRepository.webhook.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localWebhook.enabled = data?.enabled;
    this.localWebhook.webhookBase64 = data?.webhookBase64;

    this.logger.debug('[loadWebhook] Webhook carregado com sucesso.');
  }

  public async loadSettings() {
    this.logger.debug(`[loadSettings] Carregando configurações para instanceId: ${this.instanceId}`);
    const data = await this.prismaRepository.setting.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localSettings.rejectCall = data?.rejectCall;
    this.localSettings.msgCall = data?.msgCall;
    this.localSettings.groupsIgnore = data?.groupsIgnore;
    this.localSettings.alwaysOnline = data?.alwaysOnline;
    this.localSettings.readMessages = data?.readMessages;
    this.localSettings.readStatus = data?.readStatus;
    this.localSettings.syncFullHistory = data?.syncFullHistory;

    this.logger.debug('[loadSettings] Configurações carregadas com sucesso.');
  }

  public async setSettings(data: SettingsDto) {
    this.logger.debug(`[setSettings] Atualizando configurações: ${JSON.stringify(data)}`);
    await this.prismaRepository.setting.upsert({
      where: {
        instanceId: this.instanceId,
      },
      update: {
        rejectCall: data.rejectCall,
        msgCall: data.msgCall,
        groupsIgnore: data.groupsIgnore,
        alwaysOnline: data.alwaysOnline,
        readMessages: data.readMessages,
        readStatus: data.readStatus,
        syncFullHistory: data.syncFullHistory,
      },
      create: {
        rejectCall: data.rejectCall,
        msgCall: data.msgCall,
        groupsIgnore: data.groupsIgnore,
        alwaysOnline: data.alwaysOnline,
        readMessages: data.readMessages,
        readStatus: data.readStatus,
        syncFullHistory: data.syncFullHistory,
        instanceId: this.instanceId,
      },
    });

    this.localSettings.rejectCall = data?.rejectCall;
    this.localSettings.msgCall = data?.msgCall;
    this.localSettings.groupsIgnore = data?.groupsIgnore;
    this.localSettings.alwaysOnline = data?.alwaysOnline;
    this.localSettings.readMessages = data?.readMessages;
    this.localSettings.readStatus = data?.readStatus;
    this.localSettings.syncFullHistory = data?.syncFullHistory;

    this.logger.debug('[setSettings] Configurações atualizadas com sucesso.');
  }

  public async findSettings() {
    this.logger.debug(`[findSettings] Buscando configurações para instanceId: ${this.instanceId}`);
    const data = await this.prismaRepository.setting.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      this.logger.debug('[findSettings] Nenhuma configuração encontrada.');
      return null;
    }

    this.logger.debug('[findSettings] Configurações encontradas.');
    return {
      rejectCall: data.rejectCall,
      msgCall: data.msgCall,
      groupsIgnore: data.groupsIgnore,
      alwaysOnline: data.alwaysOnline,
      readMessages: data.readMessages,
      readStatus: data.readStatus,
      syncFullHistory: data.syncFullHistory,
    };
  }

  public async loadChatwoot() {
    this.logger.debug('[loadChatwoot] Carregando dados do Chatwoot...');
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
      this.logger.debug('[loadChatwoot] Chatwoot não está habilitado nas configurações.');
      return;
    }

    const data = await this.prismaRepository.chatwoot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localChatwoot.enabled = data?.enabled;
    this.localChatwoot.accountId = data?.accountId;
    this.localChatwoot.token = data?.token;
    this.localChatwoot.url = data?.url;
    this.localChatwoot.nameInbox = data?.nameInbox;
    this.localChatwoot.signMsg = data?.signMsg;
    this.localChatwoot.signDelimiter = data?.signDelimiter;
    this.localChatwoot.number = data?.number;
    this.localChatwoot.reopenConversation = data?.reopenConversation;
    this.localChatwoot.conversationPending = data?.conversationPending;
    this.localChatwoot.mergeBrazilContacts = data?.mergeBrazilContacts;
    this.localChatwoot.importContacts = data?.importContacts;
    this.localChatwoot.importMessages = data?.importMessages;
    this.localChatwoot.daysLimitImportMessages = data?.daysLimitImportMessages;

    this.logger.debug('[loadChatwoot] Dados do Chatwoot carregados com sucesso.');
  }

  public async setChatwoot(data: ChatwootDto) {
    this.logger.debug(`[setChatwoot] Atualizando dados do Chatwoot: ${JSON.stringify(data)}`);
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
      this.logger.debug('[setChatwoot] Chatwoot não está habilitado nas configurações.');
      return;
    }

    const chatwoot = await this.prismaRepository.chatwoot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (chatwoot) {
      await this.prismaRepository.chatwoot.update({
        where: {
          instanceId: this.instanceId,
        },
        data: {
          enabled: data?.enabled,
          accountId: data.accountId,
          token: data.token,
          url: data.url,
          nameInbox: data.nameInbox,
          signMsg: data.signMsg,
          signDelimiter: data.signMsg ? data.signDelimiter : null,
          number: data.number,
          reopenConversation: data.reopenConversation,
          conversationPending: data.conversationPending,
          mergeBrazilContacts: data.mergeBrazilContacts,
          importContacts: data.importContacts,
          importMessages: data.importMessages,
          daysLimitImportMessages: data.daysLimitImportMessages,
          organization: data.organization,
          logo: data.logo,
          ignoreJids: data.ignoreJids,
        },
      });

      Object.assign(this.localChatwoot, { ...data, signDelimiter: data.signMsg ? data.signDelimiter : null });
      this.clearCacheChatwoot();
      this.logger.debug('[setChatwoot] Dados do Chatwoot atualizados com sucesso.');
      return;
    }

    await this.prismaRepository.chatwoot.create({
      data: {
        enabled: data?.enabled,
        accountId: data.accountId,
        token: data.token,
        url: data.url,
        nameInbox: data.nameInbox,
        signMsg: data.signMsg,
        number: data.number,
        reopenConversation: data.reopenConversation,
        conversationPending: data.conversationPending,
        mergeBrazilContacts: data.mergeBrazilContacts,
        importContacts: data.importContacts,
        importMessages: data.importMessages,
        daysLimitImportMessages: data.daysLimitImportMessages,
        organization: data.organization,
        logo: data.logo,
        ignoreJids: data.ignoreJids,
        instanceId: this.instanceId,
      },
    });

    Object.assign(this.localChatwoot, { ...data, signDelimiter: data.signMsg ? data.signDelimiter : null });
    this.clearCacheChatwoot();
    this.logger.debug('[setChatwoot] Dados do Chatwoot criados com sucesso.');
  }

  public async findChatwoot(): Promise<ChatwootDto | null> {
    this.logger.debug(`[findChatwoot] Buscando dados do Chatwoot para instanceId: ${this.instanceId}`);
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
      this.logger.debug('[findChatwoot] Chatwoot não está habilitado nas configurações.');
      return null;
    }

    const data = await this.prismaRepository.chatwoot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      this.logger.debug('[findChatwoot] Nenhum dado de Chatwoot encontrado.');
      return null;
    }

    const ignoreJidsArray = Array.isArray(data.ignoreJids) ? data.ignoreJids.map((event) => String(event)) : [];
    this.logger.debug('[findChatwoot] Dados de Chatwoot encontrados com sucesso.');
    return {
      enabled: data?.enabled,
      accountId: data.accountId,
      token: data.token,
      url: data.url,
      nameInbox: data.nameInbox,
      signMsg: data.signMsg,
      signDelimiter: data.signDelimiter || null,
      reopenConversation: data.reopenConversation,
      conversationPending: data.conversationPending,
      mergeBrazilContacts: data.mergeBrazilContacts,
      importContacts: data.importContacts,
      importMessages: data.importMessages,
      daysLimitImportMessages: data.daysLimitImportMessages,
      organization: data.organization,
      logo: data.logo,
      ignoreJids: ignoreJidsArray,
    };
  }

  public clearCacheChatwoot() {
    this.logger.debug('[clearCacheChatwoot] Limpando cache do Chatwoot...');
    if (this.localChatwoot?.enabled) {
      this.chatwootService.getCache()?.deleteAll(this.instanceName);
      this.logger.debug('[clearCacheChatwoot] Cache do Chatwoot limpo com sucesso.');
    }
  }

  public async loadProxy() {
    this.logger.debug(`[loadProxy] Carregando dados de proxy para instanceId: ${this.instanceId}`);
    this.localProxy.enabled = false;

    if (process.env.PROXY_HOST) {
      this.localProxy.enabled = true;
      this.localProxy.host = process.env.PROXY_HOST;
      this.localProxy.port = process.env.PROXY_PORT || '80';
      this.localProxy.protocol = process.env.PROXY_PROTOCOL || 'http';
      this.localProxy.username = process.env.PROXY_USERNAME;
      this.localProxy.password = process.env.PROXY_PASSWORD;
    }

    const data = await this.prismaRepository.proxy.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (data?.enabled) {
      this.localProxy.enabled = true;
      this.localProxy.host = data?.host;
      this.localProxy.port = data?.port;
      this.localProxy.protocol = data?.protocol;
      this.localProxy.username = data?.username;
      this.localProxy.password = data?.password;
    }

    this.logger.debug('[loadProxy] Dados de proxy carregados com sucesso.');
  }

  public async setProxy(data: ProxyDto) {
    this.logger.debug(`[setProxy] Definindo dados de proxy: ${JSON.stringify(data)}`);
    await this.prismaRepository.proxy.upsert({
      where: {
        instanceId: this.instanceId,
      },
      update: {
        enabled: data?.enabled,
        host: data.host,
        port: data.port,
        protocol: data.protocol,
        username: data.username,
        password: data.password,
      },
      create: {
        enabled: data?.enabled,
        host: data.host,
        port: data.port,
        protocol: data.protocol,
        username: data.username,
        password: data.password,
        instanceId: this.instanceId,
      },
    });

    Object.assign(this.localProxy, data);
    this.logger.debug('[setProxy] Dados de proxy atualizados com sucesso.');
  }

  public async findProxy() {
    this.logger.debug(`[findProxy] Buscando dados de proxy para instanceId: ${this.instanceId}`);
    const data = await this.prismaRepository.proxy.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      this.logger.debug('[findProxy] Proxy não encontrado.');
      throw new NotFoundException('Proxy not found');
    }

    this.logger.debug('[findProxy] Dados de proxy encontrados com sucesso.');
    return data;
  }

  public async sendDataWebhook<T = any>(event: Events, data: T, local = true) {
    this.logger.debug(`[sendDataWebhook] Enviando dados de webhook. Evento: ${event}, local: ${local}`);
    const serverUrl = this.configService.get<HttpServer>('SERVER').URL;
    const tzoffset = new Date().getTimezoneOffset() * 60000; //offset in milliseconds
    const localISOTime = new Date(Date.now() - tzoffset).toISOString();
    const now = localISOTime;

    const expose = this.configService.get<Auth>('AUTHENTICATION').EXPOSE_IN_FETCH_INSTANCES;
    const instanceApikey = this.token || 'Apikey not found';

    await eventManager.emit({
      instanceName: this.instance.name,
      origin: ChannelStartupService.name,
      event,
      data,
      serverUrl,
      dateTime: now,
      sender: this.wuid,
      apiKey: expose && instanceApikey ? instanceApikey : null,
      local,
    });
    this.logger.debug('[sendDataWebhook] Evento de webhook enviado com sucesso.');
  }

  // Check if the number is MX or AR
  public formatMXOrARNumber(jid: string): string {
    this.logger.debug(`[formatMXOrARNumber] Formatando número MX ou AR: ${jid}`);
    const countryCode = jid.substring(0, 2);

    if (Number(countryCode) === 52 || Number(countryCode) === 54) {
      if (jid.length === 13) {
        const number = countryCode + jid.substring(3);
        return number;
      }
      return jid;
    }
    return jid;
  }

  // Check if the number is br
  public formatBRNumber(jid: string) {
    this.logger.debug(`[formatBRNumber] Formatando número brasileiro: ${jid}`);
    const regexp = new RegExp(/^(\d{2})(\d{2})\d{1}(\d{8})$/);
    if (regexp.test(jid)) {
      const match = regexp.exec(jid);
      if (match && match[1] === '55') {
        const joker = Number.parseInt(match[3][0]);
        const ddd = Number.parseInt(match[2]);
        if (joker < 7 || ddd < 31) {
          return match[0];
        }
        return match[1] + match[2] + match[3];
      }
      return jid;
    } else {
      return jid;
    }
  }

  public createJid(number: string): string {
    this.logger.debug(`[createJid] Criando JID para o número: ${number}`);
    if (number.includes('@g.us') || number.includes('@s.whatsapp.net') || number.includes('@lid')) {
      this.logger.debug('[createJid] Retornando número pois já possui sufixo de grupo ou WhatsApp.');
      return number;
    }

    if (number.includes('@broadcast')) {
      this.logger.debug('[createJid] Retornando número pois já é um broadcast.');
      return number;
    }

    number = number
      ?.replace(/\s/g, '')
      .replace(/\+/g, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .split(':')[0]
      .split('@')[0];

    if (number.includes('-') && number.length >= 24) {
      number = number.replace(/[^\d-]/g, '');
      this.logger.debug('[createJid] Número identificado como grupo, adicionando @g.us.');
      return `${number}@g.us`;
    }

    number = number.replace(/\D/g, '');

    if (number.length >= 18) {
      number = number.replace(/[^\d-]/g, '');
      this.logger.debug('[createJid] Número extenso, provavelmente grupo, adicionando @g.us.');
      return `${number}@g.us`;
    }

    number = this.formatMXOrARNumber(number);
    number = this.formatBRNumber(number);

    this.logger.debug('[createJid] Adicionando sufixo @s.whatsapp.net para número individual.');
    return `${number}@s.whatsapp.net`;
  }

  public async fetchContacts(query: Query<Contact>) {
    this.logger.debug(`[fetchContacts] Buscando contatos. Query: ${JSON.stringify(query)}`);
    const remoteJid = query?.where?.remoteJid
      ? query?.where?.remoteJid.includes('@')
        ? query.where?.remoteJid
        : this.createJid(query.where?.remoteJid)
      : null;

    const where = {
      instanceId: this.instanceId,
    };

    if (remoteJid) {
      where['remoteJid'] = remoteJid;
    }

    const contacts = await this.prismaRepository.contact.findMany({
      where,
    });
    this.logger.debug(`[fetchContacts] Retornando ${contacts.length} contato(s).`);
    return contacts;
  }

  public async fetchMessages(query: Query<Message>) {
    this.logger.debug(`[fetchMessages] Buscando mensagens. Query: ${JSON.stringify(query)}`);
    const keyFilters = query?.where?.key as {
      id?: string;
      fromMe?: boolean;
      remoteJid?: string;
      participants?: string;
    };

    const count = await this.prismaRepository.message.count({
      where: {
        instanceId: this.instanceId,
        id: query?.where?.id,
        source: query?.where?.source,
        messageType: query?.where?.messageType,
        AND: [
          keyFilters?.id ? { key: { path: ['id'], equals: keyFilters?.id } } : {},
          keyFilters?.fromMe ? { key: { path: ['fromMe'], equals: keyFilters?.fromMe } } : {},
          keyFilters?.remoteJid ? { key: { path: ['remoteJid'], equals: keyFilters?.remoteJid } } : {},
          keyFilters?.participants ? { key: { path: ['participants'], equals: keyFilters?.participants } } : {},
        ],
      },
    });

    if (!query?.offset) {
      query.offset = 50;
    }

    if (!query?.page) {
      query.page = 1;
    }

    const messages = await this.prismaRepository.message.findMany({
      where: {
        instanceId: this.instanceId,
        id: query?.where?.id,
        source: query?.where?.source,
        messageType: query?.where?.messageType,
        AND: [
          keyFilters?.id ? { key: { path: ['id'], equals: keyFilters?.id } } : {},
          keyFilters?.fromMe ? { key: { path: ['fromMe'], equals: keyFilters?.fromMe } } : {},
          keyFilters?.remoteJid ? { key: { path: ['remoteJid'], equals: keyFilters?.remoteJid } } : {},
          keyFilters?.participants ? { key: { path: ['participants'], equals: keyFilters?.participants } } : {},
        ],
      },
      orderBy: {
        messageTimestamp: 'desc',
      },
      skip: query.offset * (query?.page === 1 ? 0 : (query?.page as number) - 1),
      take: query.offset,
      select: {
        id: true,
        key: true,
        pushName: true,
        messageType: true,
        message: true,
        messageTimestamp: true,
        instanceId: true,
        source: true,
        contextInfo: true,
        MessageUpdate: {
          select: {
            status: true,
          },
        },
      },
    });

    this.logger.debug(`[fetchMessages] Total de mensagens encontradas: ${count}.`);
    return {
      messages: {
        total: count,
        pages: Math.ceil(count / query.offset),
        currentPage: query.page,
        records: messages,
      },
    };
  }

  public async fetchStatusMessage(query: any) {
    this.logger.debug(`[fetchStatusMessage] Buscando status de mensagens. Query: ${JSON.stringify(query)}`);
    const results = await this.prismaRepository.messageUpdate.findMany({
      where: {
        instanceId: this.instanceId,
        remoteJid: query.where?.remoteJid,
        keyId: query.where?.id,
      },
      skip: query.offset * (query?.page === 1 ? 0 : (query?.page as number) - 1),
      take: query.offset,
    });
    this.logger.debug(`[fetchStatusMessage] Retornando ${results.length} atualização(ões) de status.`);
    return results;
  }

  public async fetchChats(query: any) {
    this.logger.debug(`[fetchChats] Buscando chats. Query: ${JSON.stringify(query)}`);
    const remoteJid = query?.where?.remoteJid
      ? query?.where?.remoteJid.includes('@')
        ? query.where?.remoteJid
        : this.createJid(query.where?.remoteJid)
      : null;

    let results = [];

    if (!remoteJid) {
      results = await this.prismaRepository.$queryRaw`
        SELECT
          "Chat"."id",
          "Chat"."remoteJid",
          "Chat"."name",
          "Chat"."labels",
          "Chat"."createdAt",
          "Chat"."updatedAt",
          "Contact"."pushName",
          "Contact"."profilePicUrl",
          "Chat"."unreadMessages",
          (ARRAY_AGG("Message"."id" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_id,
          (ARRAY_AGG("Message"."key" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_key,
          (ARRAY_AGG("Message"."pushName" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_push_name,
          (ARRAY_AGG("Message"."participant" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_participant,
          (ARRAY_AGG("Message"."messageType" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_message_type,
          (ARRAY_AGG("Message"."message" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_message,
          (ARRAY_AGG("Message"."contextInfo" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_context_info,
          (ARRAY_AGG("Message"."source" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_source,
          (ARRAY_AGG("Message"."messageTimestamp" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_message_timestamp,
          (ARRAY_AGG("Message"."instanceId" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_instance_id,
          (ARRAY_AGG("Message"."sessionId" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_session_id,
          (ARRAY_AGG("Message"."status" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_status
        FROM "Chat"
        LEFT JOIN "Message" ON "Message"."messageType" != 'reactionMessage' and "Message"."key"->>'remoteJid' = "Chat"."remoteJid"
        LEFT JOIN "Contact" ON "Chat"."remoteJid" = "Contact"."remoteJid"
        WHERE 
          "Chat"."instanceId" = ${this.instanceId}
        GROUP BY
          "Chat"."id",
          "Chat"."remoteJid",
          "Contact"."id"
        ORDER BY last_message_message_timestamp DESC NULLS LAST, "Chat"."updatedAt" DESC;
      `;
    } else {
      results = await this.prismaRepository.$queryRaw`
        SELECT
          "Chat"."id",
          "Chat"."remoteJid",
          "Chat"."name",
          "Chat"."labels",
          "Chat"."createdAt",
          "Chat"."updatedAt",
          "Contact"."pushName",
          "Contact"."profilePicUrl",
          "Chat"."unreadMessages",
          (ARRAY_AGG("Message"."id" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_id,
          (ARRAY_AGG("Message"."key" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_key,
          (ARRAY_AGG("Message"."pushName" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_push_name,
          (ARRAY_AGG("Message"."participant" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_participant,
          (ARRAY_AGG("Message"."messageType" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_message_type,
          (ARRAY_AGG("Message"."message" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_message,
          (ARRAY_AGG("Message"."contextInfo" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_context_info,
          (ARRAY_AGG("Message"."source" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_source,
          (ARRAY_AGG("Message"."messageTimestamp" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_message_timestamp,
          (ARRAY_AGG("Message"."instanceId" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_instance_id,
          (ARRAY_AGG("Message"."sessionId" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_session_id,
          (ARRAY_AGG("Message"."status" ORDER BY "Message"."messageTimestamp" DESC))[1] AS last_message_status
        FROM "Chat"
        LEFT JOIN "Message" ON "Message"."messageType" != 'reactionMessage' and "Message"."key"->>'remoteJid' = "Chat"."remoteJid"
        LEFT JOIN "Contact" ON "Chat"."remoteJid" = "Contact"."remoteJid"
        WHERE 
          "Chat"."instanceId" = ${this.instanceId} AND "Chat"."remoteJid" = ${remoteJid} and "Message"."messageType" != 'reactionMessage'
        GROUP BY
          "Chat"."id",
          "Chat"."remoteJid",
          "Contact"."id"
        ORDER BY last_message_message_timestamp DESC NULLS LAST, "Chat"."updatedAt" DESC;
      `;
    }

    if (results && isArray(results) && results.length > 0) {
      this.logger.debug(`[fetchChats] Retornando ${results.length} chat(s).`);
      return results.map((chat) => {
        return {
          id: chat.id,
          remoteJid: chat.remoteJid,
          name: chat.name,
          labels: chat.labels,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          pushName: chat.pushName,
          profilePicUrl: chat.profilePicUrl,
          unreadMessages: chat.unreadMessages,
          lastMessage: chat.last_message_id
            ? {
                id: chat.last_message_id,
                key: chat.last_message_key,
                pushName: chat.last_message_push_name,
                participant: chat.last_message_participant,
                messageType: chat.last_message_message_type,
                message: chat.last_message_message,
                contextInfo: chat.last_message_context_info,
                source: chat.last_message_source,
                messageTimestamp: chat.last_message_message_timestamp,
                instanceId: chat.last_message_instance_id,
                sessionId: chat.last_message_session_id,
                status: chat.last_message_status,
              }
            : undefined,
        };
      });
    }

    this.logger.debug('[fetchChats] Nenhum chat encontrado.');
    return [];
  }
}
