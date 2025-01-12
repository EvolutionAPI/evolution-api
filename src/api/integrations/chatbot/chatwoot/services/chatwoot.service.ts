import { InstanceDto } from '@api/dto/instance.dto';
import { Options, Quoted, SendAudioDto, SendMediaDto, SendTextDto } from '@api/dto/sendMessage.dto';
import { ChatwootDto } from '@api/integrations/chatbot/chatwoot/dto/chatwoot.dto';
import { postgresClient } from '@api/integrations/chatbot/chatwoot/libs/postgres.client';
import { chatwootImport } from '@api/integrations/chatbot/chatwoot/utils/chatwoot-import-helper';
import { PrismaRepository } from '@api/repository/repository.service';
import { CacheService } from '@api/services/cache.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Events } from '@api/types/wa.types';
import { Chatwoot, ConfigService, Database, HttpServer } from '@config/env.config';
import { Logger } from '@config/logger.config';
import ChatwootClient, {
  ChatwootAPIConfig,
  contact,
  contact_inboxes,
  conversation,
  conversation_show,
  generic_id,
  inbox,
} from '@figuro/chatwoot-sdk';
import { request as chatwootRequest } from '@figuro/chatwoot-sdk/dist/core/request';
import { Chatwoot as ChatwootModel, Contact as ContactModel, Message as MessageModel } from '@prisma/client';
import i18next from '@utils/i18n';
import { sendTelemetry } from '@utils/sendTelemetry';
import axios from 'axios';
import { proto } from 'baileys';
import dayjs from 'dayjs';
import FormData from 'form-data';
import Jimp from 'jimp';
import Long from 'long';
import mime from 'mime';
import path from 'path';
import { Readable } from 'stream';
import { chatbotController } from '@api/server.module';


interface ChatwootMessage {
  messageId?: number;
  inboxId?: number;
  conversationId?: number;
  contactInboxSourceId?: string;
  isRead?: boolean;
}

export class ChatwootService {
  private readonly logger = new Logger('ChatwootService');

  private provider: any;

  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
    private readonly cache: CacheService,
  ) {
    this.logger.log('ChatwootService instanciado');
  }

  private pgClient = postgresClient.getChatwootConnection();

  private async getProvider(instance: InstanceDto): Promise<ChatwootModel | null> {
    this.logger.verbose(`[getProvider] Buscando provider no cache e monitor para: ${instance.instanceName}`);
    const cacheKey = `${instance.instanceName}:getProvider`;
    if (await this.cache.has(cacheKey)) {
      this.logger.debug(`[getProvider] Provider encontrado em cache para: ${instance.instanceName}`);
      const provider = (await this.cache.get(cacheKey)) as ChatwootModel;
      return provider;
    }

    this.logger.verbose(`[getProvider] Provider não encontrado em cache, buscando via waMonitor...`);
    const provider = await this.waMonitor.waInstances[instance.instanceName]?.findChatwoot();

    if (!provider) {
      this.logger.warn('[getProvider] provider não encontrado via waMonitor');
      return null;
    }

    this.logger.debug(`[getProvider] Provider encontrado, salvando em cache para: ${instance.instanceName}`);
    this.cache.set(cacheKey, provider);

    return provider;
  }

  private async clientCw(instance: InstanceDto) {
    this.logger.verbose(`[clientCw] Iniciando criação do client Chatwoot para: ${instance.instanceName}`);
    const provider = await this.getProvider(instance);

    if (!provider) {
      this.logger.error('[clientCw] Provider não encontrado, retornando null');
      return null;
    }

    this.logger.debug('[clientCw] Provider configurado e definido em this.provider');
    this.provider = provider;

    const client = new ChatwootClient({
      config: this.getClientCwConfig(),
    });

    this.logger.log('[clientCw] Novo ChatwootClient instanciado');
    return client;
  }

  public getClientCwConfig(): ChatwootAPIConfig & { nameInbox: string; mergeBrazilContacts: boolean } {
    this.logger.debug('[getClientCwConfig] Retornando configuração de cliente Chatwoot');
    return {
      basePath: this.provider.url,
      with_credentials: true,
      credentials: 'include',
      token: this.provider.token,
      nameInbox: this.provider.nameInbox,
      mergeBrazilContacts: this.provider.mergeBrazilContacts,
    };
  }

  public getCache() {
    this.logger.debug('[getCache] Retornando serviço de cache');
    return this.cache;
  }

  public async create(instance: InstanceDto, data: ChatwootDto) {
    this.logger.verbose(`[create] Iniciando criação/atualização de Chatwoot instance: ${JSON.stringify(data)}`);
    await this.waMonitor.waInstances[instance.instanceName].setChatwoot(data);

    if (data.autoCreate) {
      this.logger.log('[create] AutoCreate habilitado, iniciando initInstanceChatwoot');
      const urlServer = this.configService.get<HttpServer>('SERVER').URL;

      await this.initInstanceChatwoot(
        instance,
        data.nameInbox ?? instance.instanceName.split('-cwId-')[0],
        `${urlServer}/chatwoot/webhook/${encodeURIComponent(instance.instanceName)}`,
        true,
        data.number,
        data.organization,
        data.logo,
      );
    }
    this.logger.log('[create] Dados de Chatwoot instance retornados');
    return data;
  }

  public async find(instance: InstanceDto): Promise<ChatwootDto> {
    this.logger.verbose(`[find] Buscando dados de Chatwoot para a instância: ${instance.instanceName}`);
    try {
      return await this.waMonitor.waInstances[instance.instanceName].findChatwoot();
    } catch (error) {
      this.logger.error(`[find] Erro ao buscar Chatwoot: ${error}`);
      return { enabled: null, url: '' };
    }
  }

  public async getContact(instance: InstanceDto, id: number) {
    this.logger.verbose(`[getContact] Buscando contato ID: ${id} para instância: ${instance.instanceName}`);
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('[getContact] Cliente Chatwoot não encontrado');
      return null;
    }

    if (!id) {
      this.logger.warn('[getContact] ID do contato não fornecido');
      return null;
    }

    this.logger.debug(`[getContact] Chamando API do Chatwoot para obter o contato ID: ${id}`);
    const contact = await client.contact.getContactable({
      accountId: this.provider.accountId,
      id,
    });

    if (!contact) {
      this.logger.warn('[getContact] Contato não encontrado');
      return null;
    }

    this.logger.debug(`[getContact] Contato encontrado: ${JSON.stringify(contact)}`);
    return contact;
  }

  public async initInstanceChatwoot(
    instance: InstanceDto,
    inboxName: string,
    webhookUrl: string,
    qrcode: boolean,
    number: string,
    organization?: string,
    logo?: string,
  ) {
    this.logger.verbose('[initInstanceChatwoot] Iniciando criação de Inbox no Chatwoot');
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('[initInstanceChatwoot] Client não encontrado');
      return null;
    }

    this.logger.verbose('[initInstanceChatwoot] Obtendo lista de inboxes...');
    const findInbox: any = await client.inboxes.list({
      accountId: this.provider.accountId,
    });

    const checkDuplicate = findInbox.payload.map((inbox) => inbox.name).includes(inboxName);

    let inboxId: number;

    this.logger.log('[initInstanceChatwoot] Verificando duplicidade de Inbox');
    if (!checkDuplicate) {
      this.logger.log(`[initInstanceChatwoot] Inbox ${inboxName} não encontrado, criando novo Inbox`);
      const data = {
        type: 'api',
        webhook_url: webhookUrl,
      };

      const inbox = await client.inboxes.create({
        accountId: this.provider.accountId,
        data: {
          name: inboxName,
          channel: data as any,
        },
      });

      if (!inbox) {
        this.logger.warn('[initInstanceChatwoot] Inbox não pôde ser criado');
        return null;
      }

      inboxId = inbox.id;
      this.logger.log(`[initInstanceChatwoot] Inbox criado com sucesso. ID: ${inboxId}`);
    } else {
      this.logger.log(`[initInstanceChatwoot] Inbox ${inboxName} encontrado, obtendo ID existente`);
      const inbox = findInbox.payload.find((inbox) => inbox.name === inboxName);

      if (!inbox) {
        this.logger.warn('[initInstanceChatwoot] Inbox não encontrado após verificação duplicada');
        return null;
      }

      inboxId = inbox.id;
      this.logger.log(`[initInstanceChatwoot] Inbox ID reutilizado: ${inboxId}`);
    }

    if (!this.configService.get<Chatwoot>('CHATWOOT').BOT_CONTACT) {
      this.logger.log('[initInstanceChatwoot] CHATWOOT.BOT_CONTACT desabilitado, encerrando aqui');
      return true;
    }

    this.logger.log('[initInstanceChatwoot] Criando contato Bot (123456) no Chatwoot');
    const contact =
      (await this.findContact(instance, '123456')) ||
      ((await this.createContact(
        instance,
        '123456',
        inboxId,
        false,
        organization ? organization : 'EvolutionAPI',
        logo ? logo : 'https://evolution-api.com/files/evolution-api-favicon.png',
      )) as any);

    if (!contact) {
      this.logger.warn('[initInstanceChatwoot] Contato bot não foi criado/encontrado');
      return null;
    }

    const contactId = contact.id || contact.payload.contact.id;
    this.logger.log(`[initInstanceChatwoot] Contato bot criado/encontrado. ID do contato: ${contactId}`);

    if (qrcode) {
      this.logger.log('[initInstanceChatwoot] Qrcode habilitado, criando conversa de init...');
      const data = {
        contact_id: contactId.toString(),
        inbox_id: inboxId.toString(),
      };

      const conversation = await client.conversations.create({
        accountId: this.provider.accountId,
        data,
      });

      if (!conversation) {
        this.logger.warn('[initInstanceChatwoot] Conversa não criada/falhou');
        return null;
      }

      let contentMsg = 'init';

      if (number) {
        contentMsg = `init:${number}`;
      }

      const message = await client.messages.create({
        accountId: this.provider.accountId,
        conversationId: conversation.id,
        data: {
          content: contentMsg,
          message_type: 'outgoing',
        },
      });

      if (!message) {
        this.logger.warn('[initInstanceChatwoot] Mensagem de init não foi enviada');
        return null;
      }
      this.logger.log('[initInstanceChatwoot] Mensagem de init enviada com sucesso');
    }

    return true;
  }

  public async createContact(
    instance: InstanceDto,
    phoneNumber: string,
    inboxId: number,
    isGroup: boolean,
    name?: string,
    avatar_url?: string,
    jid?: string,
  ) {
    this.logger.verbose(`createContact() -> Criando contato no Chatwoot: phoneNumber=${phoneNumber}, isGroup=${isGroup}, name=${name}`);
    const client = await this.clientCw(instance);
    if (!client) {
      this.logger.warn(`createContact() -> Client Chatwoot não encontrado para: ${instance.instanceName}`);
      return null;
    }

    let data: any = {};

    // 1) Se for grupo
    if (isGroup) {
      data = {
        inbox_id: inboxId,
        name: name || phoneNumber,
        identifier: phoneNumber,
        avatar_url,
      };
    }
    // 2) Se vier webwidget:XYZ (por exemplo "webwidget:163")
    else if (jid && jid.startsWith('webwidget:')) {
      // Extrair só o número final. Ex.: "163"
      const websiteId = jid.split(':')[1] || '0';

      data = {
        inbox_id: inboxId,
        identifier: websiteId,           // <--- somente "163"
        name: name || 'WebsiteUser',
        avatar_url,
        phone_number: '',
      };
    }
    // 3) Se o "jid" não tem nenhum "@", interpretamos como ID do website normal (tipo "183")
    else if (jid && !jid.includes('@')) {
      data = {
        inbox_id: inboxId,
        identifier: jid,
        name: name || 'WebsiteUser',
        avatar_url,
        phone_number: '',
      };
    }
    // 4) Se for WhatsApp normal
    else {
      data = {
        inbox_id: inboxId,
        identifier: jid,
        name: name || phoneNumber,
        avatar_url,
        phone_number: phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`,
      };
    }

    this.logger.debug(`[createContact] Enviando request de data: ${JSON.stringify(data)}`);
    const contact = await client.contacts.create({
      accountId: this.provider.accountId,
      data,
    });

    if (!contact) {
      this.logger.warn('[createContact] Erro ao criar contato');
      return null;
    }

    this.logger.debug('[createContact] Contato criado com sucesso, procurando contato para adicionar label...');
    const findContact = await this.findContact(instance, phoneNumber);

    const contactId = findContact?.id;
    if (contactId) {
      this.logger.log(`[createContact] Adicionando label ao contato ID: ${contactId}`);
      await this.addLabelToContact(this.provider.nameInbox, contactId);
    } else {
      this.logger.warn('[createContact] Contato não encontrado para adicionar label.');
    }

    this.logger.log('[createContact] Contato criado e label atribuída (caso encontrado).');
    return contact;
  }

  public async updateContact(instance: InstanceDto, id: number, data: any) {
    this.logger.verbose(`[updateContact] Atualizando contato ID: ${id}`);
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('[updateContact] Client não encontrado');
      return null;
    }

    if (!id) {
      this.logger.warn('[updateContact] ID do contato não fornecido');
      return null;
    }

    try {
      this.logger.debug(`[updateContact] Enviando request de update para Chatwoot contato ID: ${id}`);
      const contact = await client.contacts.update({
        accountId: this.provider.accountId,
        id,
        data,
      });

      this.logger.debug('[updateContact] Contato atualizado com sucesso.');
      return contact;
    } catch (error) {
      this.logger.error(`[updateContact] Erro ao atualizar contato: ${error}`);
      return null;
    }
  }

  public async addLabelToContact(nameInbox: string, contactId: number) {
    this.logger.verbose(`[addLabelToContact] Iniciando adição de label '${nameInbox}' ao contato ID: ${contactId} via Postgres Chatwoot`,);
    try {
      const uri = this.configService.get<Chatwoot>('CHATWOOT').IMPORT.DATABASE.CONNECTION.URI;

      if (!uri) {
        this.logger.warn('[addLabelToContact] URI do banco não configurada. Abortando.');
        return false;
      }

      const sqlTags = `SELECT id, taggings_count FROM tags WHERE name = $1 LIMIT 1`;
      this.logger.debug(`[addLabelToContact] Executando query: ${sqlTags}`);
      const tagData = (await this.pgClient.query(sqlTags, [nameInbox]))?.rows[0];
      let tagId = tagData?.id;
      const taggingsCount = tagData?.taggings_count || 0;

      const sqlTag = `INSERT INTO tags (name, taggings_count) 
                      VALUES ($1, $2) 
                      ON CONFLICT (name) 
                      DO UPDATE SET taggings_count = tags.taggings_count + 1 
                      RETURNING id`;

      this.logger.debug(`[addLabelToContact] Inserindo/atualizando tags: ${sqlTag}`);
      tagId = (await this.pgClient.query(sqlTag, [nameInbox, taggingsCount + 1]))?.rows[0]?.id;

      const sqlCheckTagging = `SELECT 1 FROM taggings 
                               WHERE tag_id = $1 AND taggable_type = 'Contact' AND taggable_id = $2 AND context = 'labels' LIMIT 1`;

      this.logger.debug(`[addLabelToContact] Verificando se tagging já existe: ${sqlCheckTagging}`);
      const taggingExists = (await this.pgClient.query(sqlCheckTagging, [tagId, contactId]))?.rowCount > 0;

      if (!taggingExists) {
        const sqlInsertLabel = `INSERT INTO taggings (tag_id, taggable_type, taggable_id, context, created_at) 
                                VALUES ($1, 'Contact', $2, 'labels', NOW())`;

        this.logger.debug(`[addLabelToContact] Inserindo nova label no tagging: ${sqlInsertLabel}`);
        await this.pgClient.query(sqlInsertLabel, [tagId, contactId]);
        this.logger.verbose('[addLabelToContact] Label adicionada com sucesso ao contato.');
      } else {
        this.logger.debug('[addLabelToContact] Label já existente para este contato, não foi necessário inserir.');
      }

      return true;
    } catch (error) {
      this.logger.error(`[addLabelToContact] Erro geral: ${error}`);
      return false;
    }
  }

  public async findContact(instance: InstanceDto, phoneNumber: string) {
    this.logger.debug(`[findContact] Iniciando busca de contato para instance: ${JSON.stringify(instance)}`);
    this.logger.debug(`[findContact] phoneNumber recebido: ${phoneNumber}`);

    try {
      const client = await this.clientCw(instance);

      this.logger.debug('[findContact] Verificando se existe client do Chatwoot...');
      if (!client) {
        this.logger.warn('[findContact] client not found');
        return null;
      }

      let query: any;
      const isGroup = phoneNumber.includes('@g.us');
      this.logger.debug(`[findContact] isGroup: ${isGroup}`);

      if (!isGroup) {
        query = `+${phoneNumber}`;
      } else {
        query = phoneNumber;
      }
      this.logger.debug(`[findContact] query gerada: ${query}`);

      let contact: any;
      this.logger.debug('[findContact] Iniciando pesquisa de contato...');

      if (isGroup) {
        this.logger.debug('[findContact] Buscando contato de grupo via client.contacts.search...');
        contact = await client.contacts.search({
          accountId: this.provider.accountId,
          q: query,
        });
      } else {
        this.logger.debug('[findContact] Buscando contato via /contacts/filter na API do Chatwoot...');
        contact = await chatwootRequest(this.getClientCwConfig(), {
          method: 'POST',
          url: `/api/v1/accounts/${this.provider.accountId}/contacts/filter`,
          body: {
            payload: this.getFilterPayload(query),
          },
        });
      }

      this.logger.debug(`[findContact] Resultado da busca: ${JSON.stringify(contact)}`);

      // Aqui, vale a pena notar que a verificação original é if (!contact && contact?.payload?.length === 0) 
      // mas isso pode levar a comportamento inesperado se `contact` for undefined. Sugiro ajustar a checagem:
      if (!contact || !contact.payload || contact.payload.length === 0) {
        this.logger.warn('[findContact] contact not found');
        return null;
      }

      if (!isGroup) {
        this.logger.debug('[findContact] Contato não é de grupo. Verificando lista de contatos retornados...');
        return contact.payload.length > 1
          ? this.findContactInContactList(contact.payload, query)
          : contact.payload[0];
      } else {
        this.logger.debug('[findContact] Contato é de grupo. Verificando se algum item corresponde à query...');
        return contact.payload.find((c: any) => c.identifier === query);
      }
    } catch (error) {
      this.logger.error(`[findContact] Erro ao buscar contato: ${error}`);
      return null;
    }
  }

  private async mergeBrazilianContacts(contacts: any[]) {
    this.logger.verbose('[mergeBrazilianContacts] Tentando unificar contatos com e sem 9 (Brasil)');
    try {
      const contact = await chatwootRequest(this.getClientCwConfig(), {
        method: 'POST',
        url: `/api/v1/accounts/${this.provider.accountId}/actions/contact_merge`,
        body: {
          base_contact_id: contacts.find((contact) => contact.phone_number.length === 14)?.id,
          mergee_contact_id: contacts.find((contact) => contact.phone_number.length === 13)?.id,
        },
      });

      this.logger.debug('[mergeBrazilianContacts] Merge realizado com sucesso');
      return contact;
    } catch (err) {
      this.logger.error(`[mergeBrazilianContacts] Erro ao unificar contatos: ${err}`);
      return null;
    }
  }

  private findContactInContactList(contacts: any[], query: string) {
    this.logger.debug(`[findContactInContactList] Verificando lista de contatos duplicados para query: ${query}`);
    const phoneNumbers = this.getNumbers(query);
    const searchableFields = this.getSearchableFields();

    // eslint-disable-next-line prettier/prettier
    if (contacts.length === 2 && this.getClientCwConfig().mergeBrazilContacts && query.startsWith('+55')) {
      this.logger.debug('[findContactInContactList] Aplicando mergeBrazilianContacts');
      const contact = this.mergeBrazilianContacts(contacts);
      if (contact) {
        return contact;
      }
    }

    const phone = phoneNumbers.reduce(
      (savedNumber, number) => (number.length > savedNumber.length ? number : savedNumber),
      '',
    );

    const contact_with9 = contacts.find((contact) => contact.phone_number === phone);
    if (contact_with9) {
      this.logger.debug('[findContactInContactList] Contato com 9 encontrado.');
      return contact_with9;
    }

    for (const contact of contacts) {
      for (const field of searchableFields) {
        if (contact[field] && phoneNumbers.includes(contact[field])) {
          return contact;
        }
      }
    }

    this.logger.warn('[findContactInContactList] Nenhum contato retornado após análise');
    return null;
  }

  private getNumbers(query: string) {
    this.logger.debug(`[getNumbers] Convertendo e padronizando numero: ${query}`);
    const numbers = [];
    numbers.push(query);

    if (query.startsWith('+55') && query.length === 14) {
      const withoutNine = query.slice(0, 5) + query.slice(6);
      numbers.push(withoutNine);
    } else if (query.startsWith('+55') && query.length === 13) {
      const withNine = query.slice(0, 5) + '9' + query.slice(5);
      numbers.push(withNine);
    }

    return numbers;
  }

  private getSearchableFields() {
    this.logger.debug('[getSearchableFields] Campos pesquisáveis no Chatwoot: phone_number');
    return ['phone_number'];
  }

  private getFilterPayload(query: string) {
    this.logger.debug(`[getFilterPayload] Montando payload de filtro para query: ${query}`);
    const filterPayload = [];

    const numbers = this.getNumbers(query);
    const fieldsToSearch = this.getSearchableFields();

    fieldsToSearch.forEach((field, index1) => {
      numbers.forEach((number, index2) => {
        const queryOperator = fieldsToSearch.length - 1 === index1 && numbers.length - 1 === index2 ? null : 'OR';
        filterPayload.push({
          attribute_key: field,
          filter_operator: 'equal_to',
          values: [number.replace('+', '')],
          query_operator: queryOperator,
        });
      });
    });

    return filterPayload;
  }

public async createConversation(instance: InstanceDto, body: any) {
  try {
    this.logger.debug('[createConversation] --- Start createConversation ---');
    this.logger.debug(`[createConversation] Instance recebido: ${JSON.stringify(instance)}`);
    this.logger.debug(`[createConversation] Body recebido: ${JSON.stringify(body)}`);

    const client = await this.clientCw(instance);

    this.logger.debug('[createConversation] Verificando client do Chatwoot...');
    if (!client) {
      this.logger.warn(`[createConversation] Client não encontrado para a instância: ${JSON.stringify(instance)}`,);
      return null;
    }

    const cacheKey = `${instance.instanceName}:createConversation-${body.key.remoteJid}`;
    this.logger.debug(`[createConversation] cacheKey gerado: ${cacheKey}`);
    this.logger.verbose(`Cache key: ${cacheKey}`);

    this.logger.debug('[createConversation] Verificando se existe conversação em cache...');
    if (await this.cache.has(cacheKey)) {
      this.logger.debug(`[createConversation] Cache encontrado para key: ${cacheKey}`);
      this.logger.verbose(`Cache hit for key: ${cacheKey}`);
      const conversationId = (await this.cache.get(cacheKey)) as number;
      this.logger.debug(`[createConversation] conversationId em cache: ${conversationId}`);
      let conversationExists: conversation | boolean;
      this.logger.debug('[createConversation] Tentando buscar conversa existente no Chatwoot...');
      try {
        conversationExists = await client.conversations.get({
          accountId: this.provider.accountId,
          conversationId: conversationId,
        });
        this.logger.verbose(`Conversation exists: ${JSON.stringify(conversationExists)}`,);
      } catch (error) {
        this.logger.error(`Error getting conversation: ${error}`);
        conversationExists = false;
      }

      if (!conversationExists) {
        this.logger.debug('[createConversation] Conversa não existe mais, limpando cache e recriando...',);
        this.logger.verbose('Conversation does not exist, re-calling createConversation');
        this.cache.delete(cacheKey);
        return await this.createConversation(instance, body);
      }

      this.logger.debug('[createConversation] Conversa obtida do cache retornada com sucesso');
      return conversationId;
    }

    if (body.key.remoteJid && body.key.remoteJid.startsWith('webwidget:')) {  
      const conversation_id = body.key.remoteJid.split(':')[1] || '0';
      return parseInt(conversation_id);
    }
    this.logger.debug('[createConversation] Nenhuma conversa encontrada em cache, seguindo fluxo...');
    const isGroup = body.key.remoteJid.includes('@g.us');
    this.logger.debug(`[createConversation] isGroup: ${isGroup}`);
    this.logger.verbose(`Is group: ${isGroup}`);

    const chatId = isGroup ? body.key.remoteJid : body.key.remoteJid.split('@')[0];
    this.logger.debug(`[createConversation] chatId: ${chatId}`);
    this.logger.verbose(`Chat ID: ${chatId}`);

    let nameContact: string;
    nameContact = !body.key.fromMe ? body.pushName : chatId;
    this.logger.debug(`[createConversation] nameContact: ${nameContact}`);
    this.logger.verbose(`Name contact: ${nameContact}`);

    this.logger.debug('[createConversation] Obtendo inbox no Chatwoot...');
    const filterInbox = await this.getInbox(instance);

    if (!filterInbox) {
      this.logger.debug(`[createConversation] Inbox não encontrada para a instância: ${JSON.stringify(instance)}`,);
      return null;
    }

    if (isGroup) {
      this.logger.debug('[createConversation] Conversa de grupo detectada, processando...');
      this.logger.verbose('Processing group conversation');
      const group = await this.waMonitor.waInstances[instance.instanceName].client.groupMetadata(chatId,);
      this.logger.debug(`[createConversation] groupMetadata: ${JSON.stringify(group)}`);
      this.logger.verbose(`Group metadata: ${JSON.stringify(group)}`);

      nameContact = `${group.subject} (GROUP)`;

      const picture_url = await this.waMonitor.waInstances[instance.instanceName].profilePicture(
        body.key.participant.split('@')[0],
      );
      this.logger.debug(`[createConversation] picture_url (participant): ${JSON.stringify(picture_url)}`,);
      this.logger.verbose(`Participant profile picture URL: ${JSON.stringify(picture_url)}`,);

      const findParticipant = await this.findContact(
        instance,
        body.key.participant.split('@')[0],
      );
      this.logger.debug( `[createConversation] findParticipant: ${JSON.stringify(findParticipant)}`,);
      this.logger.verbose(`Found participant: ${JSON.stringify(findParticipant)}`);

      if (findParticipant) {
        if (!findParticipant.name || findParticipant.name === chatId) {
          this.logger.debug('[createConversation] Atualizando participante no Chatwoot...');
          await this.updateContact(instance, findParticipant.id, {
            name: body.pushName,
            avatar_url: picture_url.profilePictureUrl || null,
          });
        }
      } else {
        this.logger.debug('[createConversation] Criando novo contato (participante) no Chatwoot...');
        await this.createContact(
          instance,
          body.key.participant.split('@')[0],
          filterInbox.id,
          false,
          body.pushName,
          picture_url.profilePictureUrl || null,
          body.key.participant,
        );
      }
    }

    this.logger.debug('[createConversation] Buscando foto de perfil do contato...');
    const picture_url = await this.waMonitor.waInstances[instance.instanceName].profilePicture(chatId);
    this.logger.debug(`[createConversation] picture_url (contato): ${JSON.stringify(picture_url)}`,);
    this.logger.verbose(`Contact profile picture URL: ${JSON.stringify(picture_url)}`,);

    this.logger.debug('[createConversation] Verificando se contato já existe no Chatwoot...');
    let contact = await this.findContact(instance, chatId);
    this.logger.debug(`[createConversation] contact encontrado: ${JSON.stringify(contact)}`);
    this.logger.verbose(`Found contact: ${JSON.stringify(contact)}`);

    if (contact) {
      if (!body.key.fromMe) {
        const waProfilePictureFile =
          picture_url?.profilePictureUrl
            ?.split('#')[0]
            .split('?')[0]
            .split('/')
            .pop() || '';
        const chatwootProfilePictureFile =
          contact?.thumbnail?.split('#')[0].split('?')[0].split('/').pop() || '';
        const pictureNeedsUpdate = waProfilePictureFile !== chatwootProfilePictureFile;

        const nameNeedsUpdate =
          !contact.name ||
          contact.name === chatId ||
          (`+${chatId}`.startsWith('+55')
            ? this.getNumbers(`+${chatId}`).some(
                (v) =>
                  contact.name === v ||
                  contact.name === v.substring(3) ||
                  contact.name === v.substring(1),
              )
            : false);

        this.logger.debug(`[createConversation] pictureNeedsUpdate: ${pictureNeedsUpdate}`);
        this.logger.debug(`[createConversation] nameNeedsUpdate: ${nameNeedsUpdate}`);
        this.logger.verbose(`Picture needs update: ${pictureNeedsUpdate}`);
        this.logger.verbose(`Name needs update: ${nameNeedsUpdate}`);

        if (pictureNeedsUpdate || nameNeedsUpdate) {
          this.logger.debug('[createConversation] Atualizando contato no Chatwoot...');
          contact = await this.updateContact(instance, contact.id, {
            ...(nameNeedsUpdate && { name: nameContact }),
            ...(waProfilePictureFile === '' && { avatar: null }),
            ...(pictureNeedsUpdate && { avatar_url: picture_url?.profilePictureUrl }),
          });
        }
      }
    } else {
      this.logger.debug('[createConversation] Contato não encontrado. Criando novo contato...');
      const jid = body.key.remoteJid;
      contact = await this.createContact(
        instance,
        chatId,
        filterInbox.id,
        isGroup,
        nameContact,
        picture_url.profilePictureUrl || null,
        jid,
      );
    }

    if (!contact) {
      this.logger.warn('[createConversation] Contato não foi criado ou encontrado.');
      return null;
    }

    const contactId = contact?.payload?.id || contact?.payload?.contact?.id || contact?.id;
    this.logger.debug(`[createConversation] ID do contato: ${contactId}`);
    this.logger.verbose(`Contact ID: ${contactId}`);

    this.logger.debug('[createConversation] Listando conversas do contato no Chatwoot...');
    const contactConversations = (await client.contacts.listConversations({
      accountId: this.provider.accountId,
      id: contactId,
    })) as any;
    this.logger.debug(`[createConversation] contactConversations: ${JSON.stringify(contactConversations)}`,);
    this.logger.verbose(`Contact conversations: ${JSON.stringify(contactConversations)}`);

    if (!contactConversations || !contactConversations.payload) {
      this.logger.error('[createConversation] Nenhuma conversa encontrada ou payload indefinido');
      return null;
    }

    if (contactConversations.payload.length) {
      let conversation: any;

      if (this.provider.reopenConversation) {
          conversation = contactConversations.payload.find((conversation) => conversation.inbox_id == filterInbox.id);
        this.logger.verbose(`Found conversation in reopenConversation mode: ${JSON.stringify(conversation)}`,);

        if (this.provider.conversationPending) {
          if (conversation) {
            await client.conversations.toggleStatus({
              accountId: this.provider.accountId,
              conversationId: conversation.id,
              data: {
                status: 'pending',
              },
            });
          }
        }
      } else {
        this.logger.debug('[createConversation] Verificando conversas não resolvidas...');
        conversation = contactConversations.payload.find(
            (conversation) => conversation.status !== 'resolved' && conversation.inbox_id == filterInbox.id,
        );
        this.logger.verbose(`Found conversation: ${JSON.stringify(conversation)}`);
      }

      if (conversation) {
        this.logger.debug(`[createConversation] Retornando conversa existente: ID = ${conversation.id}`,);
        this.logger.verbose(`Returning existing conversation ID: ${conversation.id}`);
        this.cache.set(cacheKey, conversation.id);
        return conversation.id;
      }
    }

    this.logger.debug('[createConversation] Criando nova conversa no Chatwoot...');
    const data: any = {
      contact_id: contactId.toString(),
      inbox_id: filterInbox.id.toString(),
    };

    if (this.provider.conversationPending) {
      data['status'] = 'pending';
    }

    const conversation = await client.conversations.create({
      accountId: this.provider.accountId,
      data,
    });

    if (!conversation) {
      this.logger.warn('[createConversation] Conversa não foi criada ou não encontrada.');
      return null;
    }

    this.logger.debug(`[createConversation] Nova conversa criada com ID: ${conversation.id}`);
    this.logger.verbose(`New conversation created with ID: ${conversation.id}`);
    this.cache.set(cacheKey, conversation.id);

    this.logger.debug('[createConversation] --- Fim do fluxo de criação de conversa ---');
    return conversation.id;
  } catch (error) {
    this.logger.error(`[createConversation] Erro em createConversation: ${error}`);
    this.logger.error(`Error in createConversation: ${error}`);
  }
}


  public async getInbox(instance: InstanceDto): Promise<inbox | null> {
    this.logger.verbose('[getInbox] Obtendo inbox pelo nome');
    const cacheKey = `${instance.instanceName}:getInbox`;
    if (await this.cache.has(cacheKey)) {
      this.logger.debug('[getInbox] Inbox encontrada em cache');
      return (await this.cache.get(cacheKey)) as inbox;
    }

    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('[getInbox] Client não encontrado');
      return null;
    }

    this.logger.debug(`[getInbox] Procurando inbox pelo nome: ${this.getClientCwConfig().nameInbox}`);
    const inbox = (await client.inboxes.list({
      accountId: this.provider.accountId,
    })) as any;

    if (!inbox) {
      this.logger.warn('[getInbox] Nenhum inbox retornado');
      return null;
    }

    this.logger.debug(`[getInbox] Procurando inbox pelo nome: ${this.getClientCwConfig().nameInbox}`);
    const findByName = inbox.payload.find((inbox) => inbox.name === this.getClientCwConfig().nameInbox);

    if (!findByName) {
      this.logger.warn('[getInbox] Inbox não encontrado');
      return null;
    }

    this.logger.debug('[getInbox] Inbox encontrado e salvo em cache');
    this.cache.set(cacheKey, findByName);
    return findByName;
  }

  public async createMessage(
    instance: InstanceDto,
    conversationId: number,
    content: string,
    messageType: 'incoming' | 'outgoing' | undefined,
    privateMessage?: boolean,
    attachments?: {
      content: unknown;
      encoding: string;
      filename: string;
    }[],
    messageBody?: any,
    sourceId?: string,
    quotedMsg?: MessageModel,
  ) {
    this.logger.verbose('[createMessage] Criando mensagem no Chatwoot');
    this.logger.debug(
      `[createMessage] Parametros => conversationId: ${conversationId}, messageType: ${messageType}, privateMessage: ${privateMessage}, sourceId: ${sourceId}`,
    );
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('[createMessage] Client não encontrado, retornando null');
      return null;
    }

    const replyToIds = await this.getReplyToIds(messageBody, instance);
    this.logger.debug(`[createMessage] replyToIds: ${JSON.stringify(replyToIds)}`);

    const sourceReplyId = quotedMsg?.chatwootMessageId || null;

    this.logger.debug('[createMessage] Enviando mensagem para ChatwootClient...');
    const message = await client.messages.create({
      accountId: this.provider.accountId,
      conversationId: conversationId,
      data: {
        content: content,
        message_type: messageType,
        attachments: attachments,
        private: privateMessage || false,
        source_id: sourceId,
        content_attributes: {
          ...replyToIds,
        },
        source_reply_id: sourceReplyId ? sourceReplyId.toString() : null,
      },
    });

    if (!message) {
      this.logger.warn('[createMessage] Falha ao criar mensagem no Chatwoot');
      return null;
    }

    this.logger.debug(`[createMessage] Mensagem criada com sucesso: ${JSON.stringify(message)}`);
    return message;
  }

  public async getOpenConversationByContact(
    instance: InstanceDto,
    inbox: inbox,
    contact: generic_id & contact,
  ): Promise<conversation> {
    this.logger.verbose('[getOpenConversationByContact] Buscando conversa aberta para um contato específico');
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('[getOpenConversationByContact] Client não encontrado');
      return null;
    }

    const conversations = (await client.contacts.listConversations({
      accountId: this.provider.accountId,
      id: contact.id,
    })) as any;

    this.logger.debug(`[getOpenConversationByContact] Verificando conversas do contato ID: ${contact.id}`);
    return (
      conversations.payload.find(
        (conversation) => conversation.inbox_id === inbox.id && conversation.status === 'open',
      ) || undefined
    );
  }

  public async createBotMessage(
    instance: InstanceDto,
    content: string,
    messageType: 'incoming' | 'outgoing' | undefined,
    attachments?: {
      content: unknown;
      encoding: string;
      filename: string;
    }[],
  ) {
    this.logger.verbose(`[createBotMessage] Criando mensagem do bot com o conteúdo: ${content}`);
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('[createBotMessage] Client não encontrado');
      return null;
    }

    const contact = await this.findContact(instance, '123456');

    if (!contact) {
      this.logger.warn('[createBotMessage] Contato Bot (123456) não encontrado');
      return null;
    }

    const filterInbox = await this.getInbox(instance);

    if (!filterInbox) {
      this.logger.warn('[createBotMessage] Inbox não encontrado');
      return null;
    }

    const conversation = await this.getOpenConversationByContact(instance, filterInbox, contact);

    if (!conversation) {
      this.logger.warn('[createBotMessage] Conversa não encontrada');
      return;
    }

    this.logger.debug('[createBotMessage] Enviando mensagem do bot para o Chatwoot...');
    const message = await client.messages.create({
      accountId: this.provider.accountId,
      conversationId: conversation.id,
      data: {
        content: content,
        message_type: messageType,
        attachments: attachments,
      },
    });

    if (!message) {
      this.logger.warn('[createBotMessage] Falha ao criar mensagem do bot no Chatwoot');
      return null;
    }

    this.logger.debug('[createBotMessage] Mensagem do bot criada com sucesso');
    return message;
  }

  private async sendData(
    conversationId: number,
    fileStream: Readable,
    fileName: string,
    messageType: 'incoming' | 'outgoing' | undefined,
    content?: string,
    instance?: InstanceDto,
    messageBody?: any,
    sourceId?: string,
    quotedMsg?: MessageModel,
  ) {
    this.logger.verbose('[sendData] Envio de mídia/arquivo para Chatwoot');
    if (sourceId && this.isImportHistoryAvailable()) {
      this.logger.debug('[sendData] Verificando se sourceId já está salvo (evitar duplicados) no Chatwoot');
      const messageAlreadySaved = await chatwootImport.getExistingSourceIds([sourceId]);
      if (messageAlreadySaved) {
        if (messageAlreadySaved.size > 0) {
          this.logger.warn('[sendData] Mensagem já salva no Chatwoot, ignorando duplicado');
          return null;
        }
      }
    }
    const data = new FormData();

    if (content) {
      data.append('content', content);
    }

    data.append('message_type', messageType);

    this.logger.debug(`[sendData] Anexando arquivo: ${fileName}`);
    data.append('attachments[]', fileStream, { filename: fileName });

    const sourceReplyId = quotedMsg?.chatwootMessageId || null;

    if (messageBody && instance) {
      const replyToIds = await this.getReplyToIds(messageBody, instance);

      if (replyToIds.in_reply_to || replyToIds.in_reply_to_external_id) {
        const content = JSON.stringify({
          ...replyToIds,
        });
        data.append('content_attributes', content);
      }
    }

    if (sourceReplyId) {
      data.append('source_reply_id', sourceReplyId.toString());
    }

    if (sourceId) {
      data.append('source_id', sourceId);
    }

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${this.provider.url}/api/v1/accounts/${this.provider.accountId}/conversations/${conversationId}/messages`,
      headers: {
        api_access_token: this.provider.token,
        ...data.getHeaders(),
      },
      data: data,
    };

    try {
      this.logger.debug('[sendData] Fazendo request para Chatwoot com axios');
      const { data } = await axios.request(config);

      this.logger.debug('[sendData] Mídia/arquivo enviado com sucesso');
      return data;
    } catch (error) {
      this.logger.error(`[sendData] Erro ao enviar arquivo/mídia: ${error}`);
    }
  }

  public async createBotQr(
    instance: InstanceDto,
    content: string,
    messageType: 'incoming' | 'outgoing' | undefined,
    fileStream?: Readable,
    fileName?: string,
  ) {
    this.logger.verbose('[createBotQr] Criando mensagem de QR Code do bot para Chatwoot');
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('[createBotQr] Client não encontrado');
      return null;
    }

    if (!this.configService.get<Chatwoot>('CHATWOOT').BOT_CONTACT) {
      this.logger.log('[createBotQr] BOT_CONTACT desabilitado, encerrando');
      return true;
    }

    const contact = await this.findContact(instance, '123456');

    if (!contact) {
      this.logger.warn('[createBotQr] Contato Bot (123456) não encontrado');
      return null;
    }

    const filterInbox = await this.getInbox(instance);

    if (!filterInbox) {
      this.logger.warn('[createBotQr] Inbox não encontrado');
      return null;
    }

    const conversation = await this.getOpenConversationByContact(instance, filterInbox, contact);

    if (!conversation) {
      this.logger.warn('[createBotQr] Conversa não encontrada');
      return;
    }

    const data = new FormData();

    if (content) {
      data.append('content', content);
    }

    data.append('message_type', messageType);

    if (fileStream && fileName) {
      data.append('attachments[]', fileStream, { filename: fileName });
    }

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${this.provider.url}/api/v1/accounts/${this.provider.accountId}/conversations/${conversation.id}/messages`,
      headers: {
        api_access_token: this.provider.token,
        ...data.getHeaders(),
      },
      data: data,
    };

    try {
      this.logger.debug('[createBotQr] Enviando QR code como mensagem do bot ao Chatwoot');
      const { data } = await axios.request(config);

      this.logger.debug('[createBotQr] QR code enviado com sucesso');
      return data;
    } catch (error) {
      this.logger.error(`[createBotQr] Erro ao enviar QR code: ${error}`);
    }
  }

  public async sendAttachment(waInstance: any, number: string, media: any, caption?: string, options?: Options) {
    this.logger.verbose(`[sendAttachment] Enviando anexo para WhatsApp: número ${number}, media: ${media}`);
    try {
      const parsedMedia = path.parse(decodeURIComponent(media));
      let mimeType = mime.getType(parsedMedia?.ext) || '';
      let fileName = parsedMedia?.name + parsedMedia?.ext;

      if (!mimeType) {
        this.logger.debug('[sendAttachment] mimeType não identificado diretamente, tentando axios get');
        const parts = media.split('/');
        fileName = decodeURIComponent(parts[parts.length - 1]);

        const response = await axios.get(media, {
          responseType: 'arraybuffer',
        });
        mimeType = response.headers['content-type'];
      }

      let type = 'document';

      switch (mimeType.split('/')[0]) {
        case 'image':
          type = 'image';
          break;
        case 'video':
          type = 'video';
          break;
        case 'audio':
          type = 'audio';
          break;
        default:
          type = 'document';
          break;
      }

      if (type === 'audio') {
        this.logger.debug('[sendAttachment] tipo de arquivo é audio');
        const data: SendAudioDto = {
          number: number,
          audio: media,
          delay: 1200,
          quoted: options?.quoted,
        };

        sendTelemetry('/message/sendWhatsAppAudio');

        const messageSent = await waInstance?.audioWhatsapp(data, true);
        this.logger.verbose('[sendAttachment] Áudio enviado com sucesso');
        return messageSent;
      }

      if (type === 'image' && parsedMedia && parsedMedia?.ext === '.gif') {
        this.logger.debug('[sendAttachment] Arquivo .gif detectado, enviando como document');
        type = 'document';
      }

      const data: SendMediaDto = {
        number: number,
        mediatype: type as any,
        fileName: fileName,
        media: media,
        delay: 1200,
        quoted: options?.quoted,
      };

      sendTelemetry('/message/sendMedia');

      if (caption) {
        data.caption = caption;
      }

      const messageSent = await waInstance?.mediaMessage(data, null, true);
      this.logger.verbose('[sendAttachment] Mídia enviada com sucesso pelo WhatsApp');
      return messageSent;
    } catch (error) {
      this.logger.error(`[sendAttachment] Erro ao enviar anexo: ${error}`);
    }
  }

  public async onSendMessageError(instance: InstanceDto, conversation: number, error?: any) {
    this.logger.verbose(`[onSendMessageError] conversation: ${conversation}, error: ${JSON.stringify(error)}`);
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('[onSendMessageError] Client não encontrado');
      return;
    }

    if (error && error?.status === 400 && error?.message[0]?.exists === false) {
      this.logger.debug('[onSendMessageError] Erro indica que número não existe no WhatsApp. Enviando msg privada.');
      client.messages.create({
        accountId: this.provider.accountId,
        conversationId: conversation,
        data: {
          content: `${i18next.t('cw.message.numbernotinwhatsapp')}`,
          message_type: 'outgoing',
          private: true,
        },
      });

      return;
    }

    this.logger.debug('[onSendMessageError] Enviando msg de erro genérica no Chatwoot.');
    client.messages.create({
      accountId: this.provider.accountId,
      conversationId: conversation,
      data: {
        content: i18next.t('cw.message.notsent', {
          error: error ? `_${error.toString()}_` : '',
        }),
        message_type: 'outgoing',
        private: true,
      },
    });
  }

  public async receiveWebhook(instance: InstanceDto, body: any) {
    try {
      this.logger.verbose(`[receiveWebhook] Recebendo webhook do Chatwoot => Event: ${body.event}`);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const client = await this.clientCw(instance);

      if (!client) {
        this.logger.warn('[receiveWebhook] Client não encontrado');
        return null;
      }

      if (
        this.provider.reopenConversation === false &&
        body.event === 'conversation_status_changed' &&
        body.status === 'resolved' &&
        body.meta?.sender?.identifier
      ) {
        this.logger.debug('[receiveWebhook] conversation_status_changed => resolved, limpando cache...');
        const keyToDelete = `${instance.instanceName}:createConversation-${body.meta.sender.identifier}`;
        this.cache.delete(keyToDelete);
      }

      if (
        !body?.conversation ||
        body.private ||
        (body.event === 'message_updated' && !body.content_attributes?.deleted)
      ) {
        this.logger.debug('[receiveWebhook] Evento ignorado (message_updated sem delete OU private)');
        return { message: 'bot' };
      }

      // ----------------------------------------------------
      // 1) SE FOR MENSAGEM CHEGANDO DE WebWidget
      // ----------------------------------------------------
      if (
        body.message_type === 'incoming' &&
        body.conversation.channel === 'Channel::WebWidget'
      ) {
        this.logger.debug(`(WebWidget) Mensagem incoming do WebWidget: ${body.content}`);

        const evolutionInstance = this.waMonitor.waInstances[instance.instanceName];

        // Se a instância existir e ainda não tiver localChatwoot.enabled,
        // você chama o loadChatwoot() para forçar a leitura do banco:
        this.logger.debug(`[receiveWebhook] evolutionInstance.localChatwoot?.enabled: ${evolutionInstance.localChatwoot?.enabled}, evolutionInstance: ${evolutionInstance}`);
        if (evolutionInstance && !evolutionInstance.localChatwoot?.enabled) {
          this.logger.debug(`[receiveWebhook] Carregando Chatwoot manualmente p/ WebWidget...`);
          await evolutionInstance.loadChatwoot();
        }

        const webWidgetMsg = {
          key: {
            id: body.id, // ID da mensagem do Chatwoot
            remoteJid: `webwidget:${body.conversation.id}`, // ou outro "remoteJid" figurativo
            fromMe: false, // incoming => do cliente
            channel: body.conversation.channel,
            inbox_id: body.conversation.inbox_id,
          },
          pushName: body.sender?.name || 'WebWidgetUser',
          message: {
            conversation: body.content,
          },
          messageType: 'conversation', 
          messageTimestamp: Math.floor(Date.now() / 1000),
        };

        await chatbotController.emit({
          instance: { instanceName: instance.instanceName, instanceId: instance.instanceId },
          remoteJid: webWidgetMsg.key.remoteJid,
          msg: webWidgetMsg,
          pushName: webWidgetMsg.pushName,
        });

        return { message: 'webwidget_incoming_ok' };
      }

      const chatId =
        body.conversation?.meta?.sender?.identifier ||
        body.conversation?.meta?.sender?.phone_number?.replace('+', '');
      const messageReceived = body.content
        ? body.content
            .replaceAll(/(?<!\*)\*((?!\s)([^\n*]+?)(?<!\s))\*(?!\*)/g, '_$1_')
            .replaceAll(/\*{2}((?!\s)([^\n*]+?)(?<!\s))\*{2}/g, '*$1*')
            .replaceAll(/~{2}((?!\s)([^\n~]+?)(?<!\s))~{2}/g, '~$1~')
            .replaceAll(/(?<!`)`((?!\s)([^`*]+?)(?<!\s))`(?!`)/g, '```$1```')
        : body.content;

      const senderName = body?.conversation?.messages[0]?.sender?.available_name || body?.sender?.name;
      const waInstance = this.waMonitor.waInstances[instance.instanceName];

      if (body.event === 'message_updated' && body.content_attributes?.deleted) {
        this.logger.verbose('[receiveWebhook] Mensagem foi deletada no Chatwoot, replicando no WhatsApp...');
        const message = await this.prismaRepository.message.findFirst({
          where: {
            chatwootMessageId: body.id,
            instanceId: instance.instanceId,
          },
        });

        if (message) {
          const key = message.key as {
            id: string;
            remoteJid: string;
            fromMe: boolean;
            participant: string;
          };

          await waInstance?.client.sendMessage(key.remoteJid, { delete: key });

          await this.prismaRepository.message.deleteMany({
            where: {
              instanceId: instance.instanceId,
              chatwootMessageId: body.id,
            },
          });
        }
        return { message: 'bot' };
      }

      const cwBotContact = this.configService.get<Chatwoot>('CHATWOOT').BOT_CONTACT;

      if (chatId === '123456' && body.message_type === 'outgoing') {
        this.logger.verbose('[receiveWebhook] Mensagem de Comando do Bot Chatwoot detectada');
        const command = messageReceived.replace('/', '');

        if (cwBotContact && (command.includes('init') || command.includes('iniciar'))) {
          this.logger.debug('[receiveWebhook] Comando init: Tentando conectar no WA');
          const state = waInstance?.connectionStatus?.state;

          if (state !== 'open') {
            const number = command.split(':')[1];
            await waInstance.connectToWhatsapp(number);
          } else {
            await this.createBotMessage(
              instance,
              i18next.t('cw.inbox.alreadyConnected', {
                inboxName: body.inbox.name,
              }),
              'incoming',
            );
          }
        }

        if (command === 'clearcache') {
          this.logger.debug('[receiveWebhook] Comando clearcache: Limpando cache');
          waInstance.clearCacheChatwoot();
          await this.createBotMessage(
            instance,
            i18next.t('cw.inbox.clearCache', {
              inboxName: body.inbox.name,
            }),
            'incoming',
          );
        }

        if (command === 'status') {
          this.logger.debug('[receiveWebhook] Comando status: Verificando estado da instância');
          const state = waInstance?.connectionStatus?.state;

          if (!state) {
            await this.createBotMessage(
              instance,
              i18next.t('cw.inbox.notFound', {
                inboxName: body.inbox.name,
              }),
              'incoming',
            );
          } else {
            await this.createBotMessage(
              instance,
              i18next.t('cw.inbox.status', {
                inboxName: body.inbox.name,
                state: state,
              }),
              'incoming',
            );
          }
        }

        if (cwBotContact && (command === 'disconnect' || command === 'desconectar')) {
          this.logger.debug('[receiveWebhook] Comando disconnect: Desconectando instância...');
          const msgLogout = i18next.t('cw.inbox.disconnect', {
            inboxName: body.inbox.name,
          });

          await this.createBotMessage(instance, msgLogout, 'incoming');

          await waInstance?.client?.logout('Log out instance: ' + instance.instanceName);
          await waInstance?.client?.ws?.close();
        }
      }

      if (body.message_type === 'outgoing' && body?.conversation?.messages?.length && chatId !== '123456') {
        this.logger.verbose('[receiveWebhook] Mensagem do Chatwoot -> WhatsApp detectada');
        if (body?.conversation?.messages[0]?.source_id?.substring(0, 5) === 'WAID:') {
          this.logger.debug('[receiveWebhook] Mensagem ignorada pois já veio do WhatsApp');
          return { message: 'bot' };
        }

        if (!waInstance && body.conversation?.id) {
          this.logger.warn('[receiveWebhook] waInstance não encontrado, enviando erro pra Chatwoot');
          this.onSendMessageError(instance, body.conversation?.id, 'Instance not found');
          return { message: 'bot' };
        }

        let formatText: string;
        if (senderName === null || senderName === undefined) {
          formatText = messageReceived;
        } else {
          const formattedDelimiter = this.provider.signDelimiter
            ? this.provider.signDelimiter.replaceAll('\\n', '\n')
            : '\n';
          const textToConcat = this.provider.signMsg ? [`*${senderName}:*`] : [];
          textToConcat.push(messageReceived);

          formatText = textToConcat.join(formattedDelimiter);
        }

        for (const message of body.conversation.messages) {
          if (message.attachments && message.attachments.length > 0) {
            for (const attachment of message.attachments) {
              this.logger.debug('[receiveWebhook] Mensagem com anexo detectado');
              if (!messageReceived) {
                formatText = null;
              }

              const options: Options = {
                quoted: await this.getQuotedMessage(body, instance),
              };

              const messageSent = await this.sendAttachment(
                waInstance,
                chatId,
                attachment.data_url,
                formatText,
                options,
              );
              if (!messageSent && body.conversation?.id) {
                this.logger.warn('[receiveWebhook] Falha ao enviar anexo, chamando onSendMessageError');
                this.onSendMessageError(instance, body.conversation?.id);
              }

              await this.updateChatwootMessageId(
                {
                  ...messageSent,
                  owner: instance.instanceName,
                },
                {
                  messageId: body.id,
                  inboxId: body.inbox?.id,
                  conversationId: body.conversation?.id,
                  contactInboxSourceId: body.conversation?.contact_inbox?.source_id,
                },
                instance,
              );
            }
          } else {
            this.logger.debug('[receiveWebhook] Mensagem de texto pura, enviando...');
            const data: SendTextDto = {
              number: chatId,
              text: formatText,
              delay: 1200,
              quoted: await this.getQuotedMessage(body, instance),
            };

            sendTelemetry('/message/sendText');

            let messageSent: any;
            try {
              messageSent = await waInstance?.textMessage(data, true);
              if (!messageSent) {
                throw new Error('Message not sent');
              }

              if (Long.isLong(messageSent?.messageTimestamp)) {
                messageSent.messageTimestamp = messageSent.messageTimestamp?.toNumber();
              }

              await this.updateChatwootMessageId(
                {
                  ...messageSent,
                  instanceId: instance.instanceId,
                },
                {
                  messageId: body.id,
                  inboxId: body.inbox?.id,
                  conversationId: body.conversation?.id,
                  contactInboxSourceId: body.conversation?.contact_inbox?.source_id,
                },
                instance,
              );
            } catch (error) {
              this.logger.error(`[receiveWebhook] Erro ao enviar mensagem de texto: ${error}`);
              if (!messageSent && body.conversation?.id) {
                this.onSendMessageError(instance, body.conversation?.id, error);
              }
              throw error;
            }
          }
        }

        const chatwootRead = this.configService.get<Chatwoot>('CHATWOOT').MESSAGE_READ;
        if (chatwootRead) {
          this.logger.debug('[receiveWebhook] chatwootRead habilitado, marcando mensagem como lida');
          const lastMessage = await this.prismaRepository.message.findFirst({
            where: {
              key: {
                path: ['fromMe'],
                equals: false,
              },
              instanceId: instance.instanceId,
            },
          });
          if (lastMessage && !lastMessage.chatwootIsRead) {
            const key = lastMessage.key as {
              id: string;
              fromMe: boolean;
              remoteJid: string;
              participant?: string;
            };

            waInstance?.markMessageAsRead({
              readMessages: [
                {
                  id: key.id,
                  fromMe: key.fromMe,
                  remoteJid: key.remoteJid,
                },
              ],
            });
            const updateMessage = {
              chatwootMessageId: lastMessage.chatwootMessageId,
              chatwootConversationId: lastMessage.chatwootConversationId,
              chatwootInboxId: lastMessage.chatwootInboxId,
              chatwootContactInboxSourceId: lastMessage.chatwootContactInboxSourceId,
              chatwootIsRead: true,
            };

            await this.prismaRepository.message.updateMany({
              where: {
                instanceId: instance.instanceId,
                key: {
                  path: ['id'],
                  equals: key.id,
                },
              },
              data: updateMessage,
            });
          }
        }
      }

      if (body.message_type === 'template' && body.event === 'message_created') {
        this.logger.verbose('[receiveWebhook] Mensagem de template criada, enviando texto como broadcast no WA');
        // debugar body
        this.logger.debug(`[receiveWebhook] body data2: ${JSON.stringify(body)}`);
        const data2: SendTextDto = {
          number: chatId,
          text: body.content.replace(/\\\r\n|\\\n|\n/g, '\n'),
          delay: 1200,
        };

        sendTelemetry('/message/sendText');

        await waInstance?.textMessage(data2);
        const result = await this.chatwootService.receiveWebhook(instance, dataToSend);
      }

      return { message: 'bot' };
    } catch (error) {
      this.logger.error(`[receiveWebhook] Erro geral: ${error}`);
      return { message: 'bot' };
    }
  }

  private async updateChatwootMessageId(
    message: MessageModel,
    chatwootMessageIds: ChatwootMessage,
    instance: InstanceDto,
  ) {
    this.logger.verbose('[updateChatwootMessageId] Atualizando ID da mensagem do Chatwoot no banco local');
    const key = message.key as {
      id: string;
      fromMe: boolean;
      remoteJid: string;
      participant?: string;
    };

    if (!chatwootMessageIds.messageId || !key?.id) {
      this.logger.debug('[updateChatwootMessageId] messageId ou key.id não definido');
      return;
    }

    this.logger.debug(`[updateChatwootMessageId] Atualizando DB com chatwootMessageIds: ${JSON.stringify(chatwootMessageIds)}`);
    await this.prismaRepository.message.updateMany({
      where: {
        key: {
          path: ['id'],
          equals: key.id,
        },
        instanceId: instance.instanceId,
      },
      data: {
        chatwootMessageId: chatwootMessageIds.messageId,
        chatwootConversationId: chatwootMessageIds.conversationId,
        chatwootInboxId: chatwootMessageIds.inboxId,
        chatwootContactInboxSourceId: chatwootMessageIds.contactInboxSourceId,
        chatwootIsRead: chatwootMessageIds.isRead,
      },
    });

    if (this.isImportHistoryAvailable()) {
      this.logger.debug('[updateChatwootMessageId] ImportHistory habilitado, atualizando sourceId no import');
      chatwootImport.updateMessageSourceID(chatwootMessageIds.messageId, key.id);
    }
  }

  private async getMessageByKeyId(instance: InstanceDto, keyId: string): Promise<MessageModel> {
    this.logger.debug(`[getMessageByKeyId] Buscando mensagem por keyId: ${keyId}`);
    const messages = await this.prismaRepository.message.findFirst({
      where: {
        key: {
          path: ['id'],
          equals: keyId,
        },
        instanceId: instance.instanceId,
      },
    });

    return messages || null;
  }

  private async getReplyToIds(
    msg: any,
    instance: InstanceDto,
  ): Promise<{ in_reply_to: string; in_reply_to_external_id: string }> {
    this.logger.debug('[getReplyToIds] Obtendo in_reply_to e in_reply_to_external_id...');
    let inReplyTo = null;
    let inReplyToExternalId = null;

    if (msg) {
      inReplyToExternalId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId ?? msg.contextInfo?.stanzaId;
      if (inReplyToExternalId) {
        const message = await this.getMessageByKeyId(instance, inReplyToExternalId);
        if (message?.chatwootMessageId) {
          inReplyTo = message.chatwootMessageId;
        }
      }
    }

    return {
      in_reply_to: inReplyTo,
      in_reply_to_external_id: inReplyToExternalId,
    };
  }

  private async getQuotedMessage(msg: any, instance: InstanceDto): Promise<Quoted> {
    this.logger.debug('[getQuotedMessage] Verificando mensagem que está sendo respondida...');
    if (msg?.content_attributes?.in_reply_to) {
      const message = await this.prismaRepository.message.findFirst({
        where: {
          chatwootMessageId: msg?.content_attributes?.in_reply_to,
          instanceId: instance.instanceId,
        },
      });

      const key = message?.key as {
        id: string;
        fromMe: boolean;
        remoteJid: string;
        participant?: string;
      };

      if (message && key?.id) {
        this.logger.debug('[getQuotedMessage] Mensagem de citação encontrada.');
        return {
          key: message.key as proto.IMessageKey,
          message: message.message as proto.IMessage,
        };
      }
    }

    this.logger.debug('[getQuotedMessage] Nenhuma mensagem de citação encontrada.');
    return null;
  }

  private isMediaMessage(message: any) {
    const media = [
      'imageMessage',
      'documentMessage',
      'documentWithCaptionMessage',
      'audioMessage',
      'videoMessage',
      'stickerMessage',
      'viewOnceMessageV2',
    ];

    const messageKeys = Object.keys(message);
    const result = messageKeys.some((key) => media.includes(key));

    return result;
  }

  private getAdsMessage(msg: any) {
    interface AdsMessage {
      title: string;
      body: string;
      thumbnailUrl: string;
      sourceUrl: string;
    }

    const adsMessage: AdsMessage | undefined = {
      title: msg.extendedTextMessage?.contextInfo?.externalAdReply?.title || msg.contextInfo?.externalAdReply?.title,
      body: msg.extendedTextMessage?.contextInfo?.externalAdReply?.body || msg.contextInfo?.externalAdReply?.body,
      thumbnailUrl:
        msg.extendedTextMessage?.contextInfo?.externalAdReply?.thumbnailUrl ||
        msg.contextInfo?.externalAdReply?.thumbnailUrl,
      sourceUrl:
        msg.extendedTextMessage?.contextInfo?.externalAdReply?.sourceUrl || msg.contextInfo?.externalAdReply?.sourceUrl,
    };

    return adsMessage;
  }

  private getReactionMessage(msg: any) {
    interface ReactionMessage {
      key: {
        id: string;
        fromMe: boolean;
        remoteJid: string;
        participant?: string;
      };
      text: string;
    }
    const reactionMessage: ReactionMessage | undefined = msg?.reactionMessage;

    return reactionMessage;
  }

  private getTypeMessage(msg: any) {
    const types = {
      conversation: msg.conversation,
      imageMessage: msg.imageMessage?.caption,
      videoMessage: msg.videoMessage?.caption,
      extendedTextMessage: msg.extendedTextMessage?.text,
      messageContextInfo: msg.messageContextInfo?.stanzaId,
      stickerMessage: undefined,
      documentMessage: msg.documentMessage?.caption,
      documentWithCaptionMessage: msg.documentWithCaptionMessage?.message?.documentMessage?.caption,
      audioMessage: msg.audioMessage?.caption,
      contactMessage: msg.contactMessage?.vcard,
      contactsArrayMessage: msg.contactsArrayMessage,
      locationMessage: msg.locationMessage,
      liveLocationMessage: msg.liveLocationMessage,
      listMessage: msg.listMessage,
      listResponseMessage: msg.listResponseMessage,
      viewOnceMessageV2:
        msg?.message?.viewOnceMessageV2?.message?.imageMessage?.url ||
        msg?.message?.viewOnceMessageV2?.message?.videoMessage?.url ||
        msg?.message?.viewOnceMessageV2?.message?.audioMessage?.url,
    };

    return types;
  }

  private getMessageContent(types: any) {
    const typeKey = Object.keys(types).find((key) => types[key] !== undefined);

    let result = typeKey ? types[typeKey] : undefined;

    // Remove externalAdReplyBody| em Chatwoot (já é exibido de outra forma)
    if (result && typeof result === 'string' && result.includes('externalAdReplyBody|')) {
      result = result.split('externalAdReplyBody|').filter(Boolean).join('');
    }

    if (typeKey === 'locationMessage' || typeKey === 'liveLocationMessage') {
      const latitude = result.degreesLatitude;
      const longitude = result.degreesLongitude;

      const locationName = result?.name;
      const locationAddress = result?.address;

      const formattedLocation =
        `*${i18next.t('cw.locationMessage.location')}:*\n\n` +
        `_${i18next.t('cw.locationMessage.latitude')}:_ ${latitude} \n` +
        `_${i18next.t('cw.locationMessage.longitude')}:_ ${longitude} \n` +
        (locationName ? `_${i18next.t('cw.locationMessage.locationName')}:_ ${locationName}\n` : '') +
        (locationAddress ? `_${i18next.t('cw.locationMessage.locationAddress')}:_ ${locationAddress} \n` : '') +
        `_${i18next.t('cw.locationMessage.locationUrl')}:_ ` +
        `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

      return formattedLocation;
    }

    if (typeKey === 'contactMessage') {
      const vCardData = result.split('\n');
      const contactInfo = {};

      vCardData.forEach((line) => {
        const [key, value] = line.split(':');
        if (key && value) {
          contactInfo[key] = value;
        }
      });

      let formattedContact =
        `*${i18next.t('cw.contactMessage.contact')}:*\n\n` +
        `_${i18next.t('cw.contactMessage.name')}:_ ${contactInfo['FN']}`;

      let numberCount = 1;
      Object.keys(contactInfo).forEach((key) => {
        if (key.startsWith('item') && key.includes('TEL')) {
          const phoneNumber = contactInfo[key];
          formattedContact += `\n_${i18next.t('cw.contactMessage.number')} (${numberCount}):_ ${phoneNumber}`;
          numberCount++;
        } else if (key.includes('TEL')) {
          const phoneNumber = contactInfo[key];
          formattedContact += `\n_${i18next.t('cw.contactMessage.number')} (${numberCount}):_ ${phoneNumber}`;
          numberCount++;
        }
      });

      return formattedContact;
    }

    if (typeKey === 'contactsArrayMessage') {
      const formattedContacts = result.contacts.map((contact) => {
        const vCardData = contact.vcard.split('\n');
        const contactInfo = {};

        vCardData.forEach((line) => {
          const [key, value] = line.split(':');
          if (key && value) {
            contactInfo[key] = value;
          }
        });

        let formattedContact = `*${i18next.t('cw.contactMessage.contact')}:*\n\n_${i18next.t(
          'cw.contactMessage.name',
        )}:_ ${contact.displayName}`;

        let numberCount = 1;
        Object.keys(contactInfo).forEach((k) => {
          if (k.startsWith('item') && k.includes('TEL')) {
            const phoneNumber = contactInfo[k];
            formattedContact += `\n_${i18next.t('cw.contactMessage.number')} (${numberCount}):_ ${phoneNumber}`;
            numberCount++;
          } else if (k.includes('TEL')) {
            const phoneNumber = contactInfo[k];
            formattedContact += `\n_${i18next.t('cw.contactMessage.number')} (${numberCount}):_ ${phoneNumber}`;
            numberCount++;
          }
        });

        return formattedContact;
      });

      const formattedContactsArray = formattedContacts.join('\n\n');

      return formattedContactsArray;
    }

    if (typeKey === 'listMessage') {
      const listTitle = result?.title || 'Unknown';
      const listDescription = result?.description || 'Unknown';
      const listFooter = result?.footerText || 'Unknown';

      let formattedList =
        '*List Menu:*\n\n' +
        '_Title_: ' +
        listTitle +
        '\n' +
        '_Description_: ' +
        listDescription +
        '\n' +
        '_Footer_: ' +
        listFooter;

      if (result.sections && result.sections.length > 0) {
        result.sections.forEach((section, sectionIndex) => {
          formattedList += '\n\n*Section ' + (sectionIndex + 1) + ':* ' + section.title || 'Unknown\n';

          if (section.rows && section.rows.length > 0) {
            section.rows.forEach((row, rowIndex) => {
              formattedList += '\n*Line ' + (rowIndex + 1) + ':*\n';
              formattedList += '_▪️ Title:_ ' + (row.title || 'Unknown') + '\n';
              formattedList += '_▪️ Description:_ ' + (row.description || 'Unknown') + '\n';
              formattedList += '_▪️ ID:_ ' + (row.rowId || 'Unknown') + '\n';
            });
          } else {
            formattedList += '\nNo lines found in this section.\n';
          }
        });
      } else {
        formattedList += '\nNo sections found.\n';
      }

      return formattedList;
    }

    if (typeKey === 'listResponseMessage') {
      const responseTitle = result?.title || 'Unknown';
      const responseDescription = result?.description || 'Unknown';
      const responseRowId = result?.singleSelectReply?.selectedRowId || 'Unknown';

      const formattedResponseList =
        '*List Response:*\n\n' +
        '_Title_: ' +
        responseTitle +
        '\n' +
        '_Description_: ' +
        responseDescription +
        '\n' +
        '_ID_: ' +
        responseRowId;
      return formattedResponseList;
    }

    return result;
  }

  public getConversationMessage(msg: any) {
    this.logger.debug('[getConversationMessage] Extraindo texto principal da mensagem do WhatsApp...');
    const types = this.getTypeMessage(msg);

    const messageContent = this.getMessageContent(types);

    return messageContent;
  }

  public async eventWhatsapp(event: string, instance: InstanceDto, body: any) {
    try {
      this.logger.log(`[eventWhatsapp] Evento WhatsApp recebido: ${event}`);
      const waInstance = this.waMonitor.waInstances[instance.instanceName];

      if (!waInstance) {
        this.logger.warn('[eventWhatsapp] Instância WA não encontrada');
        return null;
      }

      const client = await this.clientCw(instance);

      if (!client) {
        this.logger.warn('[eventWhatsapp] Client Chatwoot não encontrado');
        return null;
      }

      if (this.provider?.ignoreJids && this.provider?.ignoreJids.length > 0) {
        this.logger.debug('[eventWhatsapp] Verificando ignoreJids...');
        const ignoreJids = Array.isArray(this.provider?.ignoreJids)
          ? this.provider.ignoreJids
          : [];

        let ignoreGroups = false;
        let ignoreContacts = false;

        if (ignoreJids.includes('@g.us')) {
          ignoreGroups = true;
        }

        if (ignoreJids.includes('@s.whatsapp.net')) {
          ignoreContacts = true;
        }

        if (ignoreGroups && body?.key?.remoteJid.endsWith('@g.us')) {
          this.logger.warn(`[eventWhatsapp] Ignorando mensagem de grupo: ${body?.key?.remoteJid}`);
          return;
        }

        if (ignoreContacts && body?.key?.remoteJid.endsWith('@s.whatsapp.net')) {
          this.logger.warn(`[eventWhatsapp] Ignorando mensagem de contato: ${body?.key?.remoteJid}`);
          return;
        }

        if (ignoreJids.includes(body?.key?.remoteJid)) {
          this.logger.warn(`[eventWhatsapp] Ignorando mensagem do JID: ${body?.key?.remoteJid}`);
          return;
        }
      }

      if (event === 'messages.upsert' || event === 'send.message') {
        if (body.key.remoteJid === 'status@broadcast') {
          this.logger.debug('[eventWhatsapp] Mensagem de status@broadcast, ignorando');
          return;
        }

        if (body.message?.ephemeralMessage?.message) {
          this.logger.debug('[eventWhatsapp] Mensagem ephemeral detectada, convertendo para message normal');
          body.message = {
            ...body.message?.ephemeralMessage?.message,
          };
        }

        const originalMessage = this.getConversationMessage(body.message);
        const bodyMessage = originalMessage
          ? originalMessage
              .replaceAll(/\*((?!\s)([^\n*]+?)(?<!\s))\*/g, '**$1**')
              .replaceAll(/_((?!\s)([^\n_]+?)(?<!\s))_/g, '*$1*')
              .replaceAll(/~((?!\s)([^\n~]+?)(?<!\s))~/g, '~~$1~~')
          : originalMessage;

        if (bodyMessage && bodyMessage.includes('Por favor, classifique esta conversa, http')) {
          this.logger.debug('[eventWhatsapp] Ignorando mensagem de classificar conversa');
          return;
        }

        const quotedId = body.contextInfo?.stanzaId || body.message?.contextInfo?.stanzaId;
        let quotedMsg = null;

        if (quotedId) {
          this.logger.debug(`[eventWhatsapp] Mensagem com citação a ID: ${quotedId}`);
          quotedMsg = await this.prismaRepository.message.findFirst({
            where: {
              key: {
                path: ['id'],
                equals: quotedId,
              },
              chatwootMessageId: {
                not: null,
              },
            },
          });
        }

        const isMedia = this.isMediaMessage(body.message);
        const adsMessage = this.getAdsMessage(body);
        const reactionMessage = this.getReactionMessage(body.message);

        if (!bodyMessage && !isMedia && !reactionMessage) {
          this.logger.warn('[eventWhatsapp] Mensagem sem corpo, sem mídia e sem reaction, ignorando...');
          return;
        }

        const getConversation = await this.createConversation(instance, body);

        if (!getConversation) {
          this.logger.warn('[eventWhatsapp] Não foi possível criar/obter conversa');
          return;
        }

        const messageType = body.key.fromMe ? 'outgoing' : 'incoming';

        if (isMedia) {
          this.logger.debug('[eventWhatsapp] É mensagem de mídia, realizando download base64...');
          const downloadBase64 = await waInstance?.getBase64FromMediaMessage({
            message: {
              ...body,
            },
          });

          let nameFile: string;
          const messageBody = body?.message[body?.messageType];
          const originalFilename =
            messageBody?.fileName || messageBody?.filename || messageBody?.message?.documentMessage?.fileName;

          if (originalFilename) {
            const parsedFile = path.parse(originalFilename);
            if (parsedFile.name && parsedFile.ext) {
              nameFile = `${parsedFile.name}-${Math.floor(Math.random() * (99 - 10 + 1) + 10)}${parsedFile.ext}`;
            }
          }

          if (!nameFile) {
            nameFile = `${Math.random().toString(36).substring(7)}.${mime.getExtension(downloadBase64.mimetype) || ''}`;
          }

          const fileData = Buffer.from(downloadBase64.base64, 'base64');

          const fileStream = new Readable();
          fileStream._read = () => {};
          fileStream.push(fileData);
          fileStream.push(null);

          if (body.key.remoteJid.includes('@g.us')) {
            const participantName = body.pushName;

            let content: string;

            if (!body.key.fromMe) {
              content = `**${participantName}:**\n\n${bodyMessage}`;
            } else {
              content = `${bodyMessage}`;
            }

            const send = await this.sendData(
              getConversation,
              fileStream,
              nameFile,
              messageType,
              content,
              instance,
              body,
              'WAID:' + body.key.id,
              quotedMsg,
            );

            if (!send) {
              this.logger.warn('[eventWhatsapp] Falha ao enviar mensagem de grupo com mídia');
              return;
            }

            return send;
          } else {
            const send = await this.sendData(
              getConversation,
              fileStream,
              nameFile,
              messageType,
              bodyMessage,
              instance,
              body,
              'WAID:' + body.key.id,
              quotedMsg,
            );

            if (!send) {
              this.logger.warn('[eventWhatsapp] Falha ao enviar mensagem com mídia');
              return;
            }

            return send;
          }
        }

        if (reactionMessage) {
          this.logger.debug('[eventWhatsapp] Mensagem de reaction detectada');
          if (reactionMessage.text) {
            const send = await this.createMessage(
              instance,
              getConversation,
              reactionMessage.text,
              messageType,
              false,
              [],
              {
                message: { extendedTextMessage: { contextInfo: { stanzaId: reactionMessage.key.id } } },
              },
              'WAID:' + body.key.id,
              quotedMsg,
            );
            if (!send) {
              this.logger.warn('[eventWhatsapp] Falha ao enviar reactionMessage');
              return;
            }
          }

          return;
        }

        const isAdsMessage = (adsMessage && adsMessage.title) || adsMessage.body || adsMessage.thumbnailUrl;
        if (isAdsMessage) {
          this.logger.debug('[eventWhatsapp] Mensagem com ADS detectada, baixando thumbnail...');
          const imgBuffer = await axios.get(adsMessage.thumbnailUrl, { responseType: 'arraybuffer' });

          const extension = mime.getExtension(imgBuffer.headers['content-type']);
          const mimeType = extension && mime.getType(extension);

          if (!mimeType) {
            this.logger.warn('[eventWhatsapp] MimeType não encontrado para ADS thumbnail');
            return;
          }

          const random = Math.random().toString(36).substring(7);
          const nameFile = `${random}.${mime.getExtension(mimeType)}`;
          const fileData = Buffer.from(imgBuffer.data, 'binary');

          const img = await Jimp.read(fileData);
          await img.cover(320, 180);

          const processedBuffer = await img.getBufferAsync(Jimp.MIME_PNG);

          const fileStream = new Readable();
          fileStream._read = () => {};
          fileStream.push(processedBuffer);
          fileStream.push(null);

          const truncStr = (str: string, len: number) => {
            if (!str) return '';
            return str.length > len ? str.substring(0, len) + '...' : str;
          };

          const title = truncStr(adsMessage.title, 40);
          const description = truncStr(adsMessage?.body, 75);

          const send = await this.sendData(
            getConversation,
            fileStream,
            nameFile,
            messageType,
            `${bodyMessage}\n\n\n**${title}**\n${description}\n${adsMessage.sourceUrl}`,
            instance,
            body,
            'WAID:' + body.key.id,
          );

          if (!send) {
            this.logger.warn('[eventWhatsapp] Falha ao enviar ADS message');
            return;
          }

          return send;
        }

        if (body.key.remoteJid.includes('@g.us')) {
          this.logger.debug('[eventWhatsapp] Mensagem de grupo sem mídia');
          const participantName = body.pushName;

          let content: string;

          if (!body.key.fromMe) {
            content = `**${participantName}**\n\n${bodyMessage}`;
          } else {
            content = `${bodyMessage}`;
          }

          const send = await this.createMessage(
            instance,
            getConversation,
            content,
            messageType,
            false,
            [],
            body,
            'WAID:' + body.key.id,
            quotedMsg,
          );

          if (!send) {
            this.logger.warn('[eventWhatsapp] Falha ao enviar mensagem de grupo');
            return;
          }

          return send;
        } else {
          this.logger.debug('[eventWhatsapp] Mensagem 1:1 sem mídia');
          const send = await this.createMessage(
            instance,
            getConversation,
            bodyMessage,
            messageType,
            false,
            [],
            body,
            'WAID:' + body.key.id,
            quotedMsg,
          );

          if (!send) {
            this.logger.warn('[eventWhatsapp] Falha ao enviar mensagem 1:1');
            return;
          }

          return send;
        }
      }

      if (event === Events.MESSAGES_DELETE) {
        this.logger.debug('[eventWhatsapp] Evento de deleção detectado');
        const chatwootDelete = this.configService.get<Chatwoot>('CHATWOOT').MESSAGE_DELETE;

        if (chatwootDelete === true) {
          if (!body?.key?.id) {
            this.logger.warn('[eventWhatsapp] key.id não encontrado para deleção, ignorando');
            return;
          }

          const message = await this.getMessageByKeyId(instance, body.key.id);

          if (message?.chatwootMessageId && message?.chatwootConversationId) {
            this.logger.verbose('[eventWhatsapp] Deletando registro no Prisma e Chatwoot');
            await this.prismaRepository.message.deleteMany({
              where: {
                key: {
                  path: ['id'],
                  equals: body.key.id,
                },
                instanceId: instance.instanceId,
              },
            });

            return await client.messages.delete({
              accountId: this.provider.accountId,
              conversationId: message.chatwootConversationId,
              messageId: message.chatwootMessageId,
            });
          }
        }
      }

      if (event === 'messages.edit') {
        this.logger.verbose('[eventWhatsapp] Mensagem editada detectada');
        const editedText = `${
          body?.editedMessage?.conversation || body?.editedMessage?.extendedTextMessage?.text
        }\n\n_\`${i18next.t('cw.message.edited')}.\`_`;
        const message = await this.getMessageByKeyId(instance, body?.key?.id);
        const key = message.key as {
          id: string;
          fromMe: boolean;
          remoteJid: string;
          participant?: string;
        };

        const messageType = key?.fromMe ? 'outgoing' : 'incoming';

        if (message && message.chatwootConversationId) {
          const send = await this.createMessage(
            instance,
            message.chatwootConversationId,
            editedText,
            messageType,
            false,
            [],
            {
              message: { extendedTextMessage: { contextInfo: { stanzaId: key.id } } },
            },
            'WAID:' + body.key.id,
            null,
          );
          if (!send) {
            this.logger.warn('[eventWhatsapp] Falha ao enviar mensagem editada para Chatwoot');
            return;
          }
        }
        return;
      }

      if (event === 'messages.read') {
        this.logger.verbose('[eventWhatsapp] Evento de mensagem lida detectado');
        if (!body?.key?.id || !body?.key?.remoteJid) {
          this.logger.warn('[eventWhatsapp] key.id ou key.remoteJid não encontrado, ignorando');
          return;
        }

        const message = await this.getMessageByKeyId(instance, body.key.id);
        const conversationId = message?.chatwootConversationId;
        const contactInboxSourceId = message?.chatwootContactInboxSourceId;

        if (conversationId) {
          let sourceId = contactInboxSourceId;
          const inbox = (await this.getInbox(instance)) as inbox & {
            inbox_identifier?: string;
          };

          if (!sourceId && inbox) {
            this.logger.debug('[eventWhatsapp] Buscando dados da conversa no Chatwoot para atualizar last_seen');
            const conversation = (await client.conversations.get({
              accountId: this.provider.accountId,
              conversationId: conversationId,
            })) as conversation_show & {
              last_non_activity_message: { conversation: { contact_inbox: contact_inboxes } };
            };
            sourceId = conversation.last_non_activity_message?.conversation?.contact_inbox?.source_id;
          }

          if (sourceId && inbox?.inbox_identifier) {
            this.logger.debug('[eventWhatsapp] Atualizando last_seen no Chatwoot...');
            const url =
              `/public/api/v1/inboxes/${inbox.inbox_identifier}/contacts/${sourceId}` +
              `/conversations/${conversationId}/update_last_seen`;
            chatwootRequest(this.getClientCwConfig(), {
              method: 'POST',
              url: url,
            });
          }
        }
        return;
      }

      if (event === 'status.instance') {
        this.logger.debug('[eventWhatsapp] Evento de status da instância detectado');
        const data = body;
        const inbox = await this.getInbox(instance);

        if (!inbox) {
          this.logger.warn('[eventWhatsapp] Inbox não encontrado ao enviar status de instância');
          return;
        }

        const msgStatus = i18next.t('cw.inbox.status', {
          inboxName: inbox.name,
          state: data.status,
        });

        await this.createBotMessage(instance, msgStatus, 'incoming');
      }

      if (event === 'connection.update') {
        this.logger.debug('[eventWhatsapp] Evento connection.update');
        if (body.status === 'open') {
          if (this.waMonitor.waInstances[instance.instanceName].qrCode.count > 0) {
            this.logger.debug('[eventWhatsapp] Conexão reestabelecida (qrCode.count > 0)');
            const msgConnection = i18next.t('cw.inbox.connected');
            await this.createBotMessage(instance, msgConnection, 'incoming');
            this.waMonitor.waInstances[instance.instanceName].qrCode.count = 0;
            chatwootImport.clearAll(instance);
          }
        }
      }

      if (event === 'qrcode.updated') {
        this.logger.debug('[eventWhatsapp] Evento qrcode.updated');
        if (body.statusCode === 500) {
          const erroQRcode = `🚨 ${i18next.t('qrlimitreached')}`;
          return await this.createBotMessage(instance, erroQRcode, 'incoming');
        } else {
          const fileData = Buffer.from(body?.qrcode.base64.replace('data:image/png;base64,', ''), 'base64');

          const fileStream = new Readable();
          fileStream._read = () => {};
          fileStream.push(fileData);
          fileStream.push(null);

          await this.createBotQr(
            instance,
            i18next.t('qrgeneratedsuccesfully'),
            'incoming',
            fileStream,
            `${instance.instanceName}.png`,
          );

          let msgQrCode = `⚡️${i18next.t('qrgeneratedsuccesfully')}\n\n${i18next.t('scanqr')}`;

          if (body?.qrcode?.pairingCode) {
            msgQrCode += `\n\n*Pairing Code:* ${body.qrcode.pairingCode.substring(0, 4)}-${body.qrcode.pairingCode.substring(
              4,
              8,
            )}`;
          }

          await this.createBotMessage(instance, msgQrCode, 'incoming');
        }
      }
    } catch (error) {
      this.logger.error(`[eventWhatsapp] Erro geral: ${error}`);
    }
  }

  public getNumberFromRemoteJid(remoteJid: string) {
    this.logger.debug(`[getNumberFromRemoteJid] Extraindo número de: ${remoteJid}`);
    return remoteJid.replace(/:\d+/, '').split('@')[0];
  }

  public startImportHistoryMessages(instance: InstanceDto) {
    this.logger.log('[startImportHistoryMessages] Iniciando processo de import histórico...');
    if (!this.isImportHistoryAvailable()) {
      this.logger.warn('[startImportHistoryMessages] ImportHistory não está disponível');
      return;
    }

    this.createBotMessage(instance, i18next.t('cw.import.startImport'), 'incoming');
  }

  public isImportHistoryAvailable() {
    const uri = this.configService.get<Chatwoot>('CHATWOOT').IMPORT.DATABASE.CONNECTION.URI;

    return uri && uri !== 'postgres://user:password@hostname:port/dbname';
  }

  public addHistoryMessages(instance: InstanceDto, messagesRaw: MessageModel[]) {
    this.logger.debug('[addHistoryMessages] Adicionando mensagens ao buffer de import histórico...');
    if (!this.isImportHistoryAvailable()) {
      this.logger.warn('[addHistoryMessages] isImportHistoryAvailable = false, ignorando...');
      return;
    }

    chatwootImport.addHistoryMessages(instance, messagesRaw);
  }

  public addHistoryContacts(instance: InstanceDto, contactsRaw: ContactModel[]) {
    this.logger.debug('[addHistoryContacts] Adicionando contatos ao buffer de import histórico...');
    if (!this.isImportHistoryAvailable()) {
      this.logger.warn('[addHistoryContacts] isImportHistoryAvailable = false, ignorando...');
      return;
    }

    return chatwootImport.addHistoryContacts(instance, contactsRaw);
  }

  public async importHistoryMessages(instance: InstanceDto) {
    this.logger.verbose('[importHistoryMessages] Importando histórico de mensagens para Chatwoot');
    if (!this.isImportHistoryAvailable()) {
      this.logger.warn('[importHistoryMessages] ImportHistory não disponível, abortando...');
      return;
    }

    this.createBotMessage(instance, i18next.t('cw.import.importingMessages'), 'incoming');

    const totalMessagesImported = await chatwootImport.importHistoryMessages(
      instance,
      this,
      await this.getInbox(instance),
      this.provider,
    );
    this.updateContactAvatarInRecentConversations(instance);

    const msg = Number.isInteger(totalMessagesImported)
      ? i18next.t('cw.import.messagesImported', { totalMessagesImported })
      : i18next.t('cw.import.messagesException');

    this.createBotMessage(instance, msg, 'incoming');

    return totalMessagesImported;
  }

  public async updateContactAvatarInRecentConversations(instance: InstanceDto, limitContacts = 100) {
    try {
      this.logger.verbose('[updateContactAvatarInRecentConversations] Atualizando avatars de contatos recentes');
      if (!this.isImportHistoryAvailable()) {
        this.logger.warn('[updateContactAvatarInRecentConversations] ImportHistory não disponível');
        return;
      }

      const client = await this.clientCw(instance);
      if (!client) {
        this.logger.warn('[updateContactAvatarInRecentConversations] Client não encontrado');
        return null;
      }

      const inbox = await this.getInbox(instance);
      if (!inbox) {
        this.logger.warn('[updateContactAvatarInRecentConversations] Inbox não encontrado');
        return null;
      }

      this.logger.debug('[updateContactAvatarInRecentConversations] Buscando contatos recentes no Chatwoot...');
      const recentContacts = await chatwootImport.getContactsOrderByRecentConversations(
        inbox,
        this.provider,
        limitContacts,
      );

      const contactIdentifiers = recentContacts
        .map((contact) => contact.identifier)
        .filter((identifier) => identifier !== null);

      const contactsWithProfilePicture = (
        await this.prismaRepository.contact.findMany({
          where: {
            instanceId: instance.instanceId,
            id: {
              in: contactIdentifiers,
            },
            profilePicUrl: {
              not: null,
            },
          },
        })
      ).reduce((acc: Map<string, ContactModel>, contact: ContactModel) => acc.set(contact.id, contact), new Map());

      recentContacts.forEach(async (contact) => {
        if (contactsWithProfilePicture.has(contact.identifier)) {
          client.contacts.update({
            accountId: this.provider.accountId,
            id: contact.id,
            data: {
              avatar_url: contactsWithProfilePicture.get(contact.identifier).profilePictureUrl || null,
            },
          });
        }
      });
    } catch (error) {
      this.logger.error(`[updateContactAvatarInRecentConversations] Erro ao atualizar avatars: ${error.toString()}`);
    }
  }

  public async syncLostMessages(
    instance: InstanceDto,
    chatwootConfig: ChatwootDto,
    prepareMessage: (message: any) => any,
  ) {
    this.logger.verbose('[syncLostMessages] Sincronizando mensagens perdidas...');
    try {
      if (!this.isImportHistoryAvailable()) {
        this.logger.warn('[syncLostMessages] ImportHistory não disponível, abortando...');
        return;
      }
      if (!this.configService.get<Database>('DATABASE').SAVE_DATA.MESSAGE_UPDATE) {
        this.logger.warn('[syncLostMessages] MESSAGE_UPDATE desabilitado, abortando...');
        return;
      }

      const inbox = await this.getInbox(instance);

      this.logger.debug('[syncLostMessages] Montando SQL para buscar mensagens no PG do Chatwoot...');
      const sqlMessages = `select * from messages m
      where account_id = ${chatwootConfig.accountId}
      and inbox_id = ${inbox.id}
      and created_at >= now() - interval '6h'
      order by created_at desc`;

      const messagesData = (await this.pgClient.query(sqlMessages))?.rows;
      this.logger.debug(`[syncLostMessages] Mensagens do Chatwoot obtidas, total: ${messagesData.length}`);
      const ids: string[] = messagesData
        .filter((message) => !!message.source_id)
        .map((message) => message.source_id.replace('WAID:', ''));

      const savedMessages = await this.prismaRepository.message.findMany({
        where: {
          Instance: { name: instance.instanceName },
          messageTimestamp: { gte: dayjs().subtract(6, 'hours').unix() },
          AND: ids.map((id) => ({ key: { path: ['id'], not: id } })),
        },
      });

      this.logger.debug(`[syncLostMessages] Filtrando messages do Prisma. total: ${savedMessages.length}`);
      const filteredMessages = savedMessages.filter(
        (msg: any) => !chatwootImport.isIgnorePhoneNumber(msg.key?.remoteJid),
      );
      const messagesRaw: any[] = [];
      for (const m of filteredMessages) {
        if (!m.message || !m.key || !m.messageTimestamp) {
          continue;
        }

        if (Long.isLong(m?.messageTimestamp)) {
          m.messageTimestamp = m.messageTimestamp?.toNumber();
        }

        messagesRaw.push(prepareMessage(m as any));
      }

      this.logger.debug(`[syncLostMessages] Total de mensagens para import: ${messagesRaw.length}`);
      this.addHistoryMessages(
        instance,
        messagesRaw.filter((msg) => !chatwootImport.isIgnorePhoneNumber(msg.key?.remoteJid)),
      );

      await chatwootImport.importHistoryMessages(instance, this, inbox, this.provider);
      const waInstance = this.waMonitor.waInstances[instance.instanceName];
      waInstance.clearCacheChatwoot();
      this.logger.verbose('[syncLostMessages] Processo de sincronização finalizado com sucesso.');
    } catch (error) {
      this.logger.error(`[syncLostMessages] Erro durante syncLostMessages: ${error}`);
      return;
    }
  }
}
