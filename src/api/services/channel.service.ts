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
import { Contact, Message, Prisma } from '@prisma/client';
import { createJid } from '@utils/createJid';
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

  public openaiService = new OpenaiService(waMonitor, this.prismaRepository, this.configService);

  public typebotService = new TypebotService(waMonitor, this.configService, this.prismaRepository, this.openaiService);

  public difyService = new DifyService(waMonitor, this.prismaRepository, this.configService, this.openaiService);

  public setInstance(instance: InstanceDto) {
    this.logger.setInstance(instance.instanceName);

    this.instance.name = instance.instanceName;
    this.instance.id = instance.instanceId;
    this.instance.integration = instance.integration;
    this.instance.number = instance.number;
    this.instance.token = instance.token;
    this.instance.businessId = instance.businessId;

    if (this.configService.get<Chatwoot>('CHATWOOT').ENABLED && this.localChatwoot?.enabled) {
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
    this.instance.integration = integration;
  }

  public get integration() {
    return this.instance.integration;
  }

  public set number(number: string) {
    this.instance.number = number;
  }

  public get number() {
    return this.instance.number;
  }

  public set token(token: string) {
    this.instance.token = token;
  }

  public get token() {
    return this.instance.token;
  }

  public get wuid() {
    return this.instance.wuid;
  }

  public async loadWebhook() {
    const data = await this.prismaRepository.webhook.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    this.localWebhook.enabled = data?.enabled;
    this.localWebhook.webhookBase64 = data?.webhookBase64;
  }

  public async loadSettings() {
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
    this.localSettings.wavoipToken = data?.wavoipToken;
  }

  public async setSettings(data: SettingsDto) {
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
        wavoipToken: data.wavoipToken,
      },
      create: {
        rejectCall: data.rejectCall,
        msgCall: data.msgCall,
        groupsIgnore: data.groupsIgnore,
        alwaysOnline: data.alwaysOnline,
        readMessages: data.readMessages,
        readStatus: data.readStatus,
        syncFullHistory: data.syncFullHistory,
        wavoipToken: data.wavoipToken,
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
    this.localSettings.wavoipToken = data?.wavoipToken;

    if (this.localSettings.wavoipToken && this.localSettings.wavoipToken.length > 0) {
      this.client.ws.close();
      this.client.ws.connect();
    }
  }

  public async findSettings() {
    const data = await this.prismaRepository.setting.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      return null;
    }

    return {
      rejectCall: data.rejectCall,
      msgCall: data.msgCall,
      groupsIgnore: data.groupsIgnore,
      alwaysOnline: data.alwaysOnline,
      readMessages: data.readMessages,
      readStatus: data.readStatus,
      syncFullHistory: data.syncFullHistory,
      wavoipToken: data.wavoipToken,
    };
  }

  public async loadChatwoot() {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
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
  }

  public async setChatwoot(data: ChatwootDto) {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
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
  }

  public async findChatwoot(): Promise<ChatwootDto | null> {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) {
      return null;
    }

    const data = await this.prismaRepository.chatwoot.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      return null;
    }

    const ignoreJidsArray = Array.isArray(data.ignoreJids) ? data.ignoreJids.map((event) => String(event)) : [];

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
    if (this.localChatwoot?.enabled) {
      this.chatwootService.getCache()?.deleteAll(this.instanceName);
    }
  }

  public async loadProxy() {
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
  }

  public async setProxy(data: ProxyDto) {
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
  }

  public async findProxy() {
    const data = await this.prismaRepository.proxy.findUnique({
      where: {
        instanceId: this.instanceId,
      },
    });

    if (!data) {
      throw new NotFoundException('Proxy not found');
    }

    return data;
  }

  public async sendDataWebhook<T = any>(event: Events, data: T, local = true, integration?: string[]) {
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
      integration,
    });
  }

  // Check if the number is MX or AR
  public formatMXOrARNumber(jid: string): string {
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

  public async fetchContacts(query: Query<Contact>) {
    const remoteJid = query?.where?.remoteJid
      ? query?.where?.remoteJid.includes('@')
        ? query.where?.remoteJid
        : createJid(query.where?.remoteJid)
      : null;

    const where = {
      instanceId: this.instanceId,
    };

    if (remoteJid) {
      where['remoteJid'] = remoteJid;
    }

    const contactFindManyArgs: Prisma.ContactFindManyArgs = {
      where,
    };

    if (query.offset) contactFindManyArgs.take = query.offset;
    if (query.page) {
      const validPage = Math.max(query.page as number, 1);
      contactFindManyArgs.skip = query.offset * (validPage - 1);
    }

    const contacts = await this.prismaRepository.contact.findMany(contactFindManyArgs);

    return contacts.map((contact) => {
      const remoteJid = contact.remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');
      const isSaved = !!contact.pushName || !!contact.profilePicUrl;
      const type = isGroup ? 'group' : isSaved ? 'contact' : 'group_member';
      return {
        ...contact,
        isGroup,
        isSaved,
        type,
      };
    });
  }

  public cleanMessageData(message: any) {
    if (!message) return message;

    const cleanedMessage = { ...message };

    const mediaUrl = cleanedMessage.message.mediaUrl;

    delete cleanedMessage.message.base64;

    if (cleanedMessage.message) {
      // Limpa imageMessage
      if (cleanedMessage.message.imageMessage) {
        cleanedMessage.message.imageMessage = {
          caption: cleanedMessage.message.imageMessage.caption,
        };
      }

      // Limpa videoMessage
      if (cleanedMessage.message.videoMessage) {
        cleanedMessage.message.videoMessage = {
          caption: cleanedMessage.message.videoMessage.caption,
        };
      }

      // Limpa audioMessage
      if (cleanedMessage.message.audioMessage) {
        cleanedMessage.message.audioMessage = {
          seconds: cleanedMessage.message.audioMessage.seconds,
        };
      }

      // Limpa stickerMessage
      if (cleanedMessage.message.stickerMessage) {
        cleanedMessage.message.stickerMessage = {};
      }

      // Limpa documentMessage
      if (cleanedMessage.message.documentMessage) {
        cleanedMessage.message.documentMessage = {
          caption: cleanedMessage.message.documentMessage.caption,
          name: cleanedMessage.message.documentMessage.name,
        };
      }

      // Limpa documentWithCaptionMessage
      if (cleanedMessage.message.documentWithCaptionMessage) {
        cleanedMessage.message.documentWithCaptionMessage = {
          caption: cleanedMessage.message.documentWithCaptionMessage.caption,
          name: cleanedMessage.message.documentWithCaptionMessage.name,
        };
      }
    }

    if (mediaUrl) cleanedMessage.message.mediaUrl = mediaUrl;

    return cleanedMessage;
  }

  public async fetchMessages(query: Query<Message>) {
    const keyFilters = query?.where?.key as {
      id?: string;
      fromMe?: boolean;
      remoteJid?: string;
      participants?: string;
    };

    const timestampFilter = {};
    if (query?.where?.messageTimestamp) {
      if (query.where.messageTimestamp['gte'] && query.where.messageTimestamp['lte']) {
        timestampFilter['messageTimestamp'] = {
          gte: Math.floor(new Date(query.where.messageTimestamp['gte']).getTime() / 1000),
          lte: Math.floor(new Date(query.where.messageTimestamp['lte']).getTime() / 1000),
        };
      }
    }

    const count = await this.prismaRepository.message.count({
      where: {
        instanceId: this.instanceId,
        id: query?.where?.id,
        source: query?.where?.source,
        messageType: query?.where?.messageType,
        ...timestampFilter,
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
        ...timestampFilter,
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
    return await this.prismaRepository.messageUpdate.findMany({
      where: {
        instanceId: this.instanceId,
        remoteJid: query.where?.remoteJid,
        keyId: query.where?.id,
      },
      skip: query.offset * (query?.page === 1 ? 0 : (query?.page as number) - 1),
      take: query.offset,
    });
  }

  public async fetchChats(query: any) {
    const remoteJid = query?.where?.remoteJid
      ? query?.where?.remoteJid.includes('@')
        ? query.where?.remoteJid
        : createJid(query.where?.remoteJid)
      : null;

    const where = {
      instanceId: this.instanceId,
    };

    if (remoteJid) {
      where['remoteJid'] = remoteJid;
    }

    const timestampFilter =
      query?.where?.messageTimestamp?.gte && query?.where?.messageTimestamp?.lte
        ? Prisma.sql`
        AND "Message"."messageTimestamp" >= ${Math.floor(new Date(query.where.messageTimestamp.gte).getTime() / 1000)}
        AND "Message"."messageTimestamp" <= ${Math.floor(new Date(query.where.messageTimestamp.lte).getTime() / 1000)}`
        : Prisma.sql``;

    const limit = query?.take ? Prisma.sql`LIMIT ${query.take}` : Prisma.sql``;
    const offset = query?.skip ? Prisma.sql`OFFSET ${query.skip}` : Prisma.sql``;

    const results = await this.prismaRepository.$queryRaw`
      WITH rankedMessages AS (
        SELECT DISTINCT ON ("Message"."key"->>'remoteJid') 
          "Contact"."id" as "contactId",
          "Message"."key"->>'remoteJid' as "remoteJid",
          CASE 
            WHEN "Message"."key"->>'remoteJid' LIKE '%@g.us' THEN COALESCE("Chat"."name", "Contact"."pushName")
            ELSE COALESCE("Contact"."pushName", "Message"."pushName")
          END as "pushName",
          "Contact"."profilePicUrl",
          COALESCE(
            to_timestamp("Message"."messageTimestamp"::double precision), 
            "Contact"."updatedAt"
          ) as "updatedAt",
          "Chat"."name" as "pushName",
          "Chat"."createdAt" as "windowStart",
          "Chat"."createdAt" + INTERVAL '24 hours' as "windowExpires",
          CASE WHEN "Chat"."createdAt" + INTERVAL '24 hours' > NOW() THEN true ELSE false END as "windowActive",
          "Message"."id" AS lastMessageId,
          "Message"."key" AS lastMessage_key,
          CASE
            WHEN "Message"."key"->>'fromMe' = 'true' THEN 'Você'
            ELSE "Message"."pushName"
          END AS lastMessagePushName,
          "Message"."participant" AS lastMessageParticipant,
          "Message"."messageType" AS lastMessageMessageType,
          "Message"."message" AS lastMessageMessage,
          "Message"."contextInfo" AS lastMessageContextInfo,
          "Message"."source" AS lastMessageSource,
          "Message"."messageTimestamp" AS lastMessageMessageTimestamp,
          "Message"."instanceId" AS lastMessageInstanceId,
          "Message"."sessionId" AS lastMessageSessionId,
          "Message"."status" AS lastMessageStatus
        FROM "Message"
        LEFT JOIN "Contact" ON "Contact"."remoteJid" = "Message"."key"->>'remoteJid' AND "Contact"."instanceId" = "Message"."instanceId"
        LEFT JOIN "Chat" ON "Chat"."remoteJid" = "Message"."key"->>'remoteJid' AND "Chat"."instanceId" = "Message"."instanceId"
        WHERE "Message"."instanceId" = ${this.instanceId}
        ${remoteJid ? Prisma.sql`AND "Message"."key"->>'remoteJid' = ${remoteJid}` : Prisma.sql``}
        ${timestampFilter}
        ORDER BY "Message"."key"->>'remoteJid', "Message"."messageTimestamp" DESC
      )
      SELECT * FROM rankedMessages 
      ORDER BY "updatedAt" DESC NULLS LAST
      ${limit}
      ${offset};
    `;

    if (results && isArray(results) && results.length > 0) {
      const mappedResults = results.map((contact) => {
        const lastMessage = contact.lastmessageid
          ? {
              id: contact.lastmessageid,
              key: contact.lastmessage_key,
              pushName: contact.lastmessagepushname,
              participant: contact.lastmessageparticipant,
              messageType: contact.lastmessagemessagetype,
              message: contact.lastmessagemessage,
              contextInfo: contact.lastmessagecontextinfo,
              source: contact.lastmessagesource,
              messageTimestamp: contact.lastmessagemessagetimestamp,
              instanceId: contact.lastmessageinstanceid,
              sessionId: contact.lastmessagesessionid,
              status: contact.lastmessagestatus,
            }
          : undefined;

        return {
          id: contact.contactid || null,
          remoteJid: contact.remotejid,
          pushName: contact.pushname,
          profilePicUrl: contact.profilepicurl,
          updatedAt: contact.updatedat,
          windowStart: contact.windowstart,
          windowExpires: contact.windowexpires,
          windowActive: contact.windowactive,
          lastMessage: lastMessage ? this.cleanMessageData(lastMessage) : undefined,
          unreadCount: 0,
          isSaved: !!contact.contactid,
        };
      });

      if (query?.take && query?.skip) {
        const skip = query.skip || 0;
        const take = query.take || 20;
        return mappedResults.slice(skip, skip + take);
      }

      return mappedResults;
    }

    return [];
  }
}
