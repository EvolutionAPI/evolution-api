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
import { proto, WAMessageKey } from 'baileys';
import dayjs from 'dayjs';
import FormData from 'form-data';
import { Jimp, JimpMime } from 'jimp';
import Long from 'long';
import mimeTypes from 'mime-types';
import path from 'path';
import { Readable } from 'stream';

const MIN_CONNECTION_NOTIFICATION_INTERVAL_MS = 30000; // 30 seconds

interface ChatwootMessage {
  messageId?: number;
  inboxId?: number;
  conversationId?: number;
  contactInboxSourceId?: string;
  isRead?: boolean;
}

export class ChatwootService {
  private readonly logger = new Logger('ChatwootService');

  // HTTP timeout constants
  private readonly MEDIA_DOWNLOAD_TIMEOUT_MS = 60000; // 60 seconds for large files

  // S3/MinIO retry configuration (external storage - longer delays, fewer retries)
  private readonly S3_MAX_RETRIES = 3;
  private readonly S3_BASE_DELAY_MS = 1000; // Base delay: 1 second
  private readonly S3_MAX_DELAY_MS = 8000; // Max delay: 8 seconds

  // Database polling retry configuration (internal DB - shorter delays, more retries)
  private readonly DB_POLLING_MAX_RETRIES = 5;
  private readonly DB_POLLING_BASE_DELAY_MS = 100; // Base delay: 100ms
  private readonly DB_POLLING_MAX_DELAY_MS = 2000; // Max delay: 2 seconds

  // Webhook processing delay
  private readonly WEBHOOK_INITIAL_DELAY_MS = 500; // Initial delay before processing webhook

  // Lock polling delay
  private readonly LOCK_POLLING_DELAY_MS = 300; // Delay between lock status checks

  private provider: any;

  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
    private readonly cache: CacheService,
  ) {}

  private pgClient = postgresClient.getChatwootConnection();

  private async getProvider(instance: InstanceDto): Promise<ChatwootModel | null> {
    const cacheKey = `${instance.instanceName}:getProvider`;
    if (await this.cache.has(cacheKey)) {
      const provider = (await this.cache.get(cacheKey)) as ChatwootModel;

      return provider;
    }

    const provider = await this.waMonitor.waInstances[instance.instanceName]?.findChatwoot();

    if (!provider) {
      this.logger.warn('provider not found');
      return null;
    }

    this.cache.set(cacheKey, provider);

    return provider;
  }

  private async clientCw(instance: InstanceDto) {
    const provider = await this.getProvider(instance);

    if (!provider) {
      this.logger.error('provider not found');
      return null;
    }

    this.provider = provider;

    const client = new ChatwootClient({
      config: this.getClientCwConfig(),
    });

    return client;
  }

  public getClientCwConfig(): ChatwootAPIConfig & { nameInbox: string; mergeBrazilContacts: boolean } {
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
    return this.cache;
  }

  public async create(instance: InstanceDto, data: ChatwootDto) {
    await this.waMonitor.waInstances[instance.instanceName].setChatwoot(data);

    if (data.autoCreate) {
      this.logger.log('Auto create chatwoot instance');
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
    return data;
  }

  public async find(instance: InstanceDto): Promise<ChatwootDto> {
    try {
      return await this.waMonitor.waInstances[instance.instanceName].findChatwoot();
    } catch {
      this.logger.error('chatwoot not found');
      return { enabled: null, url: '' };
    }
  }

  public async getContact(instance: InstanceDto, id: number) {
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    if (!id) {
      this.logger.warn('id is required');
      return null;
    }

    const contact = await client.contact.getContactable({
      accountId: this.provider.accountId,
      id,
    });

    if (!contact) {
      this.logger.warn('contact not found');
      return null;
    }

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
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    const findInbox: any = await client.inboxes.list({
      accountId: this.provider.accountId,
    });

    const checkDuplicate = findInbox.payload.map((inbox) => inbox.name).includes(inboxName);

    let inboxId: number;

    this.logger.log('Creating chatwoot inbox');
    if (!checkDuplicate) {
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
        this.logger.warn('inbox not found');
        return null;
      }

      inboxId = inbox.id;
    } else {
      const inbox = findInbox.payload.find((inbox) => inbox.name === inboxName);

      if (!inbox) {
        this.logger.warn('inbox not found');
        return null;
      }

      inboxId = inbox.id;
    }
    this.logger.log(`Inbox created - inboxId: ${inboxId}`);

    if (!this.configService.get<Chatwoot>('CHATWOOT').BOT_CONTACT) {
      this.logger.log('Chatwoot bot contact is disabled');

      return true;
    }

    this.logger.log('Creating chatwoot bot contact');
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
      this.logger.warn('contact not found');
      return null;
    }

    const contactId = contact.id || contact.payload.contact.id;
    this.logger.log(`Contact created - contactId: ${contactId}`);

    if (qrcode) {
      this.logger.log('QR code enabled');
      const data = {
        contact_id: contactId.toString(),
        inbox_id: inboxId.toString(),
      };

      const conversation = await client.conversations.create({
        accountId: this.provider.accountId,
        data,
      });

      if (!conversation) {
        this.logger.warn('conversation not found');
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
        this.logger.warn('conversation not found');
        return null;
      }
      this.logger.log('Init message sent');
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
    try {
      const client = await this.clientCw(instance);

      if (!client) {
        this.logger.warn('client not found');
        return null;
      }

      let data: any = {};
      if (!isGroup) {
        data = {
          inbox_id: inboxId,
          name: name || phoneNumber,
          identifier: jid,
          avatar_url: avatar_url,
        };

        if ((jid && jid.includes('@')) || !jid) {
          data['phone_number'] = `+${phoneNumber}`;
        }
      } else {
        data = {
          inbox_id: inboxId,
          name: name || phoneNumber,
          identifier: phoneNumber,
          avatar_url: avatar_url,
        };
      }

      const contact = await client.contacts.create({
        accountId: this.provider.accountId,
        data,
      });

      if (!contact) {
        this.logger.warn('contact not found');
        return null;
      }

      const findContact = await this.findContact(instance, phoneNumber);

      const contactId = findContact?.id;

      await this.addLabelToContact(this.provider.nameInbox, contactId);

      return contact;
    } catch (error) {
      this.logger.error('Error creating contact');
      console.log(error);
      return null;
    }
  }

  public async updateContact(instance: InstanceDto, id: number, data: any) {
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    if (!id) {
      this.logger.warn('id is required');
      return null;
    }

    try {
      const contact = await client.contacts.update({
        accountId: this.provider.accountId,
        id,
        data,
      });

      return contact;
    } catch {
      return null;
    }
  }

  public async addLabelToContact(nameInbox: string, contactId: number) {
    try {
      const uri = this.configService.get<Chatwoot>('CHATWOOT').IMPORT.DATABASE.CONNECTION.URI;

      if (!uri) return false;

      const sqlTags = `SELECT id, taggings_count FROM tags WHERE name = $1 LIMIT 1`;
      const tagData = (await this.pgClient.query(sqlTags, [nameInbox]))?.rows[0];
      let tagId = tagData?.id;
      const taggingsCount = tagData?.taggings_count || 0;

      const sqlTag = `INSERT INTO tags (name, taggings_count) 
                      VALUES ($1, $2) 
                      ON CONFLICT (name) 
                      DO UPDATE SET taggings_count = tags.taggings_count + 1 
                      RETURNING id`;

      tagId = (await this.pgClient.query(sqlTag, [nameInbox, taggingsCount + 1]))?.rows[0]?.id;

      const sqlCheckTagging = `SELECT 1 FROM taggings 
                               WHERE tag_id = $1 AND taggable_type = 'Contact' AND taggable_id = $2 AND context = 'labels' LIMIT 1`;

      const taggingExists = (await this.pgClient.query(sqlCheckTagging, [tagId, contactId]))?.rowCount > 0;

      if (!taggingExists) {
        const sqlInsertLabel = `INSERT INTO taggings (tag_id, taggable_type, taggable_id, context, created_at) 
                                VALUES ($1, 'Contact', $2, 'labels', NOW())`;

        await this.pgClient.query(sqlInsertLabel, [tagId, contactId]);
      }

      return true;
    } catch {
      return false;
    }
  }

  public async findContact(instance: InstanceDto, phoneNumber: string) {
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    let query: any;
    const isGroup = phoneNumber.includes('@g.us');

    if (!isGroup) {
      query = `+${phoneNumber}`;
    } else {
      query = phoneNumber;
    }

    let contact: any;

    if (isGroup) {
      contact = await client.contacts.search({
        accountId: this.provider.accountId,
        q: query,
      });
    } else {
      contact = await chatwootRequest(this.getClientCwConfig(), {
        method: 'POST',
        url: `/api/v1/accounts/${this.provider.accountId}/contacts/filter`,
        body: {
          payload: this.getFilterPayload(query),
        },
      });
    }

    if (!contact && contact?.payload?.length === 0) {
      this.logger.warn('contact not found');
      return null;
    }

    if (!isGroup) {
      return contact.payload.length > 1 ? this.findContactInContactList(contact.payload, query) : contact.payload[0];
    } else {
      return contact.payload.find((contact) => contact.identifier === query);
    }
  }

  private async mergeContacts(baseId: number, mergeId: number) {
    try {
      const contact = await chatwootRequest(this.getClientCwConfig(), {
        method: 'POST',
        url: `/api/v1/accounts/${this.provider.accountId}/actions/contact_merge`,
        body: {
          base_contact_id: baseId,
          mergee_contact_id: mergeId,
        },
      });

      return contact;
    } catch {
      this.logger.error('Error merging contacts');
      return null;
    }
  }

  private async mergeBrazilianContacts(contacts: any[]) {
    try {
      const contact = await chatwootRequest(this.getClientCwConfig(), {
        method: 'POST',
        url: `/api/v1/accounts/${this.provider.accountId}/actions/contact_merge`,
        body: {
          base_contact_id: contacts.find((contact) => contact.phone_number.length === 14)?.id,
          mergee_contact_id: contacts.find((contact) => contact.phone_number.length === 13)?.id,
        },
      });

      return contact;
    } catch {
      this.logger.error('Error merging contacts');
      return null;
    }
  }

  private findContactInContactList(contacts: any[], query: string) {
    const phoneNumbers = this.getNumbers(query);
    const searchableFields = this.getSearchableFields();

    // eslint-disable-next-line prettier/prettier
    if (contacts.length === 2 && this.getClientCwConfig().mergeBrazilContacts && query.startsWith('+55')) {
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
      return contact_with9;
    }

    for (const contact of contacts) {
      for (const field of searchableFields) {
        if (contact[field] && phoneNumbers.includes(contact[field])) {
          return contact;
        }
      }
    }

    return null;
  }

  private getNumbers(query: string) {
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
    return ['phone_number'];
  }

  private getFilterPayload(query: string) {
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
    const isLid = body.key.addressingMode === 'lid' && body.key.remoteJidAlt;
    const remoteJid = isLid ? body.key.remoteJidAlt : body.key.remoteJid;
    const cacheKey = `${instance.instanceName}:createConversation-${remoteJid}`;
    const lockKey = `${instance.instanceName}:lock:createConversation-${remoteJid}`;
    const maxWaitTime = 5000; // 5 seconds
    const client = await this.clientCw(instance);
    if (!client) return null;

    try {
      // Processa atualização de contatos já criados @lid
      if (isLid && body.key.remoteJidAlt !== body.key.remoteJid) {
        const contact = await this.findContact(instance, body.key.remoteJid.split('@')[0]);
        if (contact && contact.identifier !== body.key.remoteJidAlt) {
          this.logger.verbose(
            `Identifier needs update: (contact.identifier: ${contact.identifier}, body.key.remoteJid: ${body.key.remoteJid}, body.key.remoteJidAlt: ${body.key.remoteJidAlt}`,
          );
          const updateContact = await this.updateContact(instance, contact.id, {
            identifier: body.key.remoteJidAlt,
            phone_number: `+${body.key.remoteJidAlt.split('@')[0]}`,
          });

          if (updateContact === null) {
            const baseContact = await this.findContact(instance, body.key.remoteJidAlt.split('@')[0]);
            if (baseContact) {
              await this.mergeContacts(baseContact.id, contact.id);
              this.logger.verbose(
                `Merge contacts: (${baseContact.id}) ${baseContact.phone_number} and (${contact.id}) ${contact.phone_number}`,
              );
            }
          }
        }
      }
      this.logger.verbose(`--- Start createConversation ---`);
      this.logger.verbose(`Instance: ${JSON.stringify(instance)}`);

      // If it already exists in the cache, return conversationId
      if (await this.cache.has(cacheKey)) {
        const conversationId = (await this.cache.get(cacheKey)) as number;
        this.logger.verbose(`Found conversation to: ${remoteJid}, conversation ID: ${conversationId}`);
        let conversationExists: conversation | boolean;
        try {
          conversationExists = await client.conversations.get({
            accountId: this.provider.accountId,
            conversationId: conversationId,
          });
          this.logger.verbose(`Conversation exists: ${JSON.stringify(conversationExists)}`);
        } catch (error) {
          this.logger.error(`Error getting conversation: ${error}`);
          conversationExists = false;
        }
        if (!conversationExists) {
          this.logger.verbose('Conversation does not exist, re-calling createConversation');
          this.cache.delete(cacheKey);
          return await this.createConversation(instance, body);
        }
        return conversationId;
      }

      // If lock already exists, wait until release or timeout
      if (await this.cache.has(lockKey)) {
        this.logger.verbose(`Operação de criação já em andamento para ${remoteJid}, aguardando resultado...`);
        const start = Date.now();
        while (await this.cache.has(lockKey)) {
          if (Date.now() - start > maxWaitTime) {
            this.logger.warn(`Timeout aguardando lock para ${remoteJid}`);
            break;
          }
          await new Promise((res) => setTimeout(res, this.LOCK_POLLING_DELAY_MS));
          if (await this.cache.has(cacheKey)) {
            const conversationId = (await this.cache.get(cacheKey)) as number;
            this.logger.verbose(`Resolves creation of: ${remoteJid}, conversation ID: ${conversationId}`);
            return conversationId;
          }
        }
      }

      // Adquire lock
      await this.cache.set(lockKey, true, 30);
      this.logger.verbose(`Bloqueio adquirido para: ${lockKey}`);

      try {
        /*
        Double check after lock
        Utilizei uma nova verificação para evitar que outra thread execute entre o terminio do while e o set lock
        */
        if (await this.cache.has(cacheKey)) {
          return (await this.cache.get(cacheKey)) as number;
        }

        const isGroup = remoteJid.includes('@g.us');
        const chatId = isGroup ? remoteJid : remoteJid.split('@')[0].split(':')[0];
        let nameContact = !body.key.fromMe ? body.pushName : chatId;
        const filterInbox = await this.getInbox(instance);
        if (!filterInbox) return null;

        if (isGroup) {
          this.logger.verbose(`Processing group conversation`);
          const group = await this.waMonitor.waInstances[instance.instanceName].client.groupMetadata(chatId);
          this.logger.verbose(`Group metadata: ${JSON.stringify(group)}`);

          nameContact = `${group.subject} (GROUP)`;

          const picture_url = await this.waMonitor.waInstances[instance.instanceName].profilePicture(
            body.key.participant.split('@')[0],
          );
          this.logger.verbose(`Participant profile picture URL: ${JSON.stringify(picture_url)}`);

          const findParticipant = await this.findContact(instance, body.key.participant.split('@')[0]);
          this.logger.verbose(`Found participant: ${JSON.stringify(findParticipant)}`);

          if (findParticipant) {
            if (!findParticipant.name || findParticipant.name === chatId) {
              await this.updateContact(instance, findParticipant.id, {
                name: body.pushName,
                avatar_url: picture_url.profilePictureUrl || null,
              });
            }
          } else {
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

        const picture_url = await this.waMonitor.waInstances[instance.instanceName].profilePicture(chatId);
        this.logger.verbose(`Contact profile picture URL: ${JSON.stringify(picture_url)}`);

        let contact = await this.findContact(instance, chatId);

        if (contact) {
          this.logger.verbose(`Found contact: ${JSON.stringify(contact)}`);
          if (!body.key.fromMe) {
            const waProfilePictureFile =
              picture_url?.profilePictureUrl?.split('#')[0].split('?')[0].split('/').pop() || '';
            const chatwootProfilePictureFile = contact?.thumbnail?.split('#')[0].split('?')[0].split('/').pop() || '';
            const pictureNeedsUpdate = waProfilePictureFile !== chatwootProfilePictureFile;
            const nameNeedsUpdate =
              !contact.name ||
              contact.name === chatId ||
              (`+${chatId}`.startsWith('+55')
                ? this.getNumbers(`+${chatId}`).some(
                    (v) => contact.name === v || contact.name === v.substring(3) || contact.name === v.substring(1),
                  )
                : false);
            this.logger.verbose(`Picture needs update: ${pictureNeedsUpdate}`);
            this.logger.verbose(`Name needs update: ${nameNeedsUpdate}`);
            if (pictureNeedsUpdate || nameNeedsUpdate) {
              contact = await this.updateContact(instance, contact.id, {
                ...(nameNeedsUpdate && { name: nameContact }),
                ...(waProfilePictureFile === '' && { avatar: null }),
                ...(pictureNeedsUpdate && { avatar_url: picture_url?.profilePictureUrl }),
              });
            }
          }
        } else {
          contact = await this.createContact(
            instance,
            chatId,
            filterInbox.id,
            isGroup,
            nameContact,
            picture_url.profilePictureUrl || null,
            remoteJid,
          );
        }

        if (!contact) {
          this.logger.warn(`Contact not created or found`);
          return null;
        }

        const contactId = contact?.payload?.id || contact?.payload?.contact?.id || contact?.id;
        this.logger.verbose(`Contact ID: ${contactId}`);

        const contactConversations = (await client.contacts.listConversations({
          accountId: this.provider.accountId,
          id: contactId,
        })) as any;
        this.logger.verbose(`Contact conversations: ${JSON.stringify(contactConversations)}`);

        if (!contactConversations || !contactConversations.payload) {
          this.logger.error(`No conversations found or payload is undefined`);
          return null;
        }

        let inboxConversation = contactConversations.payload.find(
          (conversation) => conversation.inbox_id == filterInbox.id,
        );
        if (inboxConversation) {
          if (this.provider.reopenConversation) {
            this.logger.verbose(`Found conversation in reopenConversation mode: ${JSON.stringify(inboxConversation)}`);
            if (inboxConversation && this.provider.conversationPending && inboxConversation.status !== 'open') {
              await client.conversations.toggleStatus({
                accountId: this.provider.accountId,
                conversationId: inboxConversation.id,
                data: {
                  status: 'pending',
                },
              });
            }
          } else {
            inboxConversation = contactConversations.payload.find(
              (conversation) =>
                conversation && conversation.status !== 'resolved' && conversation.inbox_id == filterInbox.id,
            );
            this.logger.verbose(`Found conversation: ${JSON.stringify(inboxConversation)}`);
          }

          if (inboxConversation) {
            this.logger.verbose(`Returning existing conversation ID: ${inboxConversation.id}`);
            this.cache.set(cacheKey, inboxConversation.id, 8 * 3600);
            return inboxConversation.id;
          }
        }

        const data = {
          contact_id: contactId.toString(),
          inbox_id: filterInbox.id.toString(),
        };

        if (this.provider.conversationPending) {
          data['status'] = 'pending';
        }

        /*
        Triple check after lock
        Utilizei uma nova verificação para evitar que outra thread execute entre o terminio do while e o set lock
        */
        if (await this.cache.has(cacheKey)) {
          return (await this.cache.get(cacheKey)) as number;
        }

        const conversation = await client.conversations.create({
          accountId: this.provider.accountId,
          data,
        });

        if (!conversation) {
          this.logger.warn(`Conversation not created or found`);
          return null;
        }

        this.logger.verbose(`New conversation created of ${remoteJid} with ID: ${conversation.id}`);
        this.cache.set(cacheKey, conversation.id, 8 * 3600);
        return conversation.id;
      } finally {
        await this.cache.delete(lockKey);
        this.logger.verbose(`Block released for: ${lockKey}`);
      }
    } catch (error) {
      this.logger.error(`Error in createConversation: ${error}`);
      return null;
    }
  }

  public async getInbox(instance: InstanceDto): Promise<inbox | null> {
    const cacheKey = `${instance.instanceName}:getInbox`;
    if (await this.cache.has(cacheKey)) {
      return (await this.cache.get(cacheKey)) as inbox;
    }

    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    const inbox = (await client.inboxes.list({
      accountId: this.provider.accountId,
    })) as any;

    if (!inbox) {
      this.logger.warn('inbox not found');
      return null;
    }

    const findByName = inbox.payload.find((inbox) => inbox.name === this.getClientCwConfig().nameInbox);

    if (!findByName) {
      this.logger.warn('inbox not found');
      return null;
    }

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
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    const replyToIds = await this.getReplyToIds(messageBody, instance);

    const sourceReplyId = quotedMsg?.chatwootMessageId || null;

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
      this.logger.warn('message not found');
      return null;
    }

    return message;
  }

  public async getOpenConversationByContact(
    instance: InstanceDto,
    inbox: inbox,
    contact: generic_id & contact,
  ): Promise<conversation> {
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    const conversations = (await client.contacts.listConversations({
      accountId: this.provider.accountId,
      id: contact.id,
    })) as any;

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
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    const contact = await this.findContact(instance, '123456');

    if (!contact) {
      this.logger.warn('contact not found');
      return null;
    }

    const filterInbox = await this.getInbox(instance);

    if (!filterInbox) {
      this.logger.warn('inbox not found');
      return null;
    }

    const conversation = await this.getOpenConversationByContact(instance, filterInbox, contact);

    if (!conversation) {
      this.logger.warn('conversation not found');
      return;
    }

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
      this.logger.warn('message not found');
      return null;
    }

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
    if (sourceId && this.isImportHistoryAvailable()) {
      const messageAlreadySaved = await chatwootImport.getExistingSourceIds([sourceId], conversationId);
      if (messageAlreadySaved) {
        if (messageAlreadySaved.size > 0) {
          this.logger.warn('Message already saved on chatwoot');
          return null;
        }
      }
    }
    const data = new FormData();

    if (content) {
      data.append('content', content);
    }

    data.append('message_type', messageType);

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
      const { data } = await axios.request(config);

      return data;
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async createBotQr(
    instance: InstanceDto,
    content: string,
    messageType: 'incoming' | 'outgoing' | undefined,
    fileStream?: Readable,
    fileName?: string,
  ) {
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    if (!this.configService.get<Chatwoot>('CHATWOOT').BOT_CONTACT) {
      this.logger.log('Chatwoot bot contact is disabled');

      return true;
    }

    const contact = await this.findContact(instance, '123456');

    if (!contact) {
      this.logger.warn('contact not found');
      return null;
    }

    const filterInbox = await this.getInbox(instance);

    if (!filterInbox) {
      this.logger.warn('inbox not found');
      return null;
    }

    const conversation = await this.getOpenConversationByContact(instance, filterInbox, contact);

    if (!conversation) {
      this.logger.warn('conversation not found');
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
      const { data } = await axios.request(config);

      return data;
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async sendAttachment(waInstance: any, number: string, media: any, caption?: string, options?: Options) {
    try {
      // Sempre baixar o arquivo do MinIO/S3 antes de enviar
      // URLs presigned podem expirar, então convertemos para base64
      let mediaBuffer: Buffer;
      let mimeType: string;
      let fileName: string;

      try {
        this.logger.verbose(`Downloading media from: ${media}`);

        // Tentar fazer download do arquivo com autenticação do Chatwoot
        // maxRedirects: 0 para não seguir redirects automaticamente
        const response = await axios.get(media, {
          responseType: 'arraybuffer',
          timeout: this.MEDIA_DOWNLOAD_TIMEOUT_MS,
          headers: {
            api_access_token: this.provider.token,
          },
          maxRedirects: 0, // Não seguir redirects automaticamente
          validateStatus: (status) => status < 500, // Aceitar redirects (301, 302, 307)
        });

        this.logger.verbose(`Initial response status: ${response.status}`);

        // Se for redirect, pegar a URL de destino e fazer novo request
        if (response.status >= 300 && response.status < 400) {
          const redirectUrl = response.headers.location;
          this.logger.verbose(`Redirect to: ${redirectUrl}`);

          if (redirectUrl) {
            // Fazer novo request para a URL do S3/MinIO (sem autenticação, pois é presigned URL)
            // IMPORTANTE: Chatwoot pode gerar a URL presigned ANTES de fazer upload
            // Vamos tentar com retry usando exponential backoff se receber 404 (arquivo ainda não disponível)
            this.logger.verbose('Downloading from S3/MinIO...');

            let s3Response;
            let retryCount = 0;
            const maxRetries = this.S3_MAX_RETRIES;
            const baseDelay = this.S3_BASE_DELAY_MS;
            const maxDelay = this.S3_MAX_DELAY_MS;

            while (retryCount <= maxRetries) {
              s3Response = await axios.get(redirectUrl, {
                responseType: 'arraybuffer',
                timeout: this.MEDIA_DOWNLOAD_TIMEOUT_MS,
                validateStatus: (status) => status < 500,
              });

              this.logger.verbose(
                `S3 response status: ${s3Response.status}, size: ${s3Response.data?.byteLength || 0} bytes (attempt ${retryCount + 1}/${maxRetries + 1})`,
              );

              // Se não for 404, sair do loop
              if (s3Response.status !== 404) {
                break;
              }

              // Se for 404 e ainda tem tentativas, aguardar com exponential backoff e tentar novamente
              if (retryCount < maxRetries) {
                // Exponential backoff com max delay (seguindo padrão do webhook controller)
                const backoffDelay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
                const errorBody = s3Response.data?.toString ? s3Response.data.toString('utf-8') : s3Response.data;
                this.logger.warn(
                  `File not yet available in S3/MinIO (attempt ${retryCount + 1}/${maxRetries + 1}). Retrying in ${backoffDelay}ms with exponential backoff...`,
                );
                this.logger.verbose(`MinIO Response: ${errorBody}`);
                await new Promise((resolve) => setTimeout(resolve, backoffDelay));
                retryCount++;
              } else {
                // Última tentativa falhou
                break;
              }
            }

            // Após todas as tentativas, verificar o status final
            if (s3Response.status === 404) {
              const errorBody = s3Response.data?.toString ? s3Response.data.toString('utf-8') : s3Response.data;
              this.logger.error(`File not found in S3/MinIO after ${maxRetries + 1} attempts. URL: ${redirectUrl}`);
              this.logger.error(`MinIO Error Response: ${errorBody}`);
              throw new Error(
                'File not found in S3/MinIO (404). The file may have been deleted, the URL is incorrect, or Chatwoot has not finished uploading yet.',
              );
            }

            if (s3Response.status === 403) {
              this.logger.error(`Access denied to S3/MinIO. URL may have expired: ${redirectUrl}`);
              throw new Error(
                'Access denied to S3/MinIO (403). Presigned URL may have expired. Check S3_PRESIGNED_EXPIRATION setting.',
              );
            }

            if (s3Response.status >= 400) {
              this.logger.error(`S3/MinIO error ${s3Response.status}: ${s3Response.statusText}`);
              throw new Error(`S3/MinIO error ${s3Response.status}: ${s3Response.statusText}`);
            }

            mediaBuffer = Buffer.from(s3Response.data);
            mimeType = s3Response.headers['content-type'] || 'application/octet-stream';
            this.logger.verbose(`Downloaded ${mediaBuffer.length} bytes from S3, type: ${mimeType}`);
          } else {
            this.logger.error('Redirect response without Location header');
            throw new Error('Redirect without Location header');
          }
        } else if (response.status === 404) {
          this.logger.error(`File not found (404) at: ${media}`);
          throw new Error('File not found (404). The attachment may not exist in Chatwoot storage.');
        } else if (response.status >= 400) {
          this.logger.error(`HTTP ${response.status}: ${response.statusText} for URL: ${media}`);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        } else {
          // Download direto sem redirect
          mediaBuffer = Buffer.from(response.data);
          mimeType = response.headers['content-type'] || 'application/octet-stream';
          this.logger.verbose(`Downloaded ${mediaBuffer.length} bytes directly, type: ${mimeType}`);
        }

        // Extrair nome do arquivo da URL ou usar o content-disposition
        const parsedMedia = path.parse(decodeURIComponent(media));
        if (parsedMedia?.name && parsedMedia?.ext) {
          fileName = parsedMedia.name + parsedMedia.ext;
        } else {
          const parts = media.split('/');
          fileName = decodeURIComponent(parts[parts.length - 1].split('?')[0]);
        }

        this.logger.verbose(`File name: ${fileName}, size: ${mediaBuffer.length} bytes`);
      } catch (downloadError) {
        this.logger.error('[MEDIA DOWNLOAD] ❌ Error downloading media from: ' + media);
        this.logger.error(`[MEDIA DOWNLOAD] Error message: ${downloadError.message}`);
        this.logger.error(`[MEDIA DOWNLOAD] Error stack: ${downloadError.stack}`);
        this.logger.error(`[MEDIA DOWNLOAD] Full error: ${JSON.stringify(downloadError, null, 2)}`);
        throw new Error(`Failed to download media: ${downloadError.message}`);
      }

      // Determinar o tipo de mídia pelo mimetype
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

      // Para áudio, usar base64 com data URI
      if (type === 'audio') {
        const base64Audio = `data:${mimeType};base64,${mediaBuffer.toString('base64')}`;
        const data: SendAudioDto = {
          number: number,
          audio: base64Audio,
          delay: 1200,
          quoted: options?.quoted,
        };

        sendTelemetry('/message/sendWhatsAppAudio');

        const messageSent = await waInstance?.audioWhatsapp(data, null, true);

        return messageSent;
      }

      // Para outros tipos, converter para base64 puro (sem prefixo data URI)
      const base64Media = mediaBuffer.toString('base64');

      const documentExtensions = ['.gif', '.svg', '.tiff', '.tif', '.dxf', '.dwg'];
      const parsedExt = path.parse(fileName)?.ext;
      if (type === 'image' && parsedExt && documentExtensions.includes(parsedExt)) {
        type = 'document';
      }

      const data: SendMediaDto = {
        number: number,
        mediatype: type as any,
        fileName: fileName,
        media: base64Media, // Base64 puro, sem prefixo
        delay: 1200,
        quoted: options?.quoted,
      };

      sendTelemetry('/message/sendMedia');

      if (caption) {
        data.caption = caption;
      }

      const messageSent = await waInstance?.mediaMessage(data, null, true);

      return messageSent;
    } catch (error) {
      this.logger.error(error);
      throw error; // Re-throw para que o erro seja tratado pelo caller
    }
  }

  public async onSendMessageError(instance: InstanceDto, conversation: number, error?: any) {
    this.logger.verbose(`onSendMessageError ${JSON.stringify(error)}`);

    const client = await this.clientCw(instance);

    if (!client) {
      return;
    }

    if (error && error?.status === 400 && error?.message[0]?.exists === false) {
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

  /**
   * Processa deleção de mensagem em background
   * Método assíncrono chamado via setImmediate para não bloquear resposta do webhook
   */
  private async processDeletion(instance: InstanceDto, body: any, deleteLockKey: string) {
    this.logger.warn(`[DELETE] 🗑️ Processing deletion - messageId: ${body.id}`);
    const waInstance = this.waMonitor.waInstances[instance.instanceName];

    // Buscar TODAS as mensagens com esse chatwootMessageId (pode ser múltiplos anexos)
    const messages = await this.prismaRepository.message.findMany({
      where: {
        chatwootMessageId: body.id,
        instanceId: instance.instanceId,
      },
    });

    if (messages && messages.length > 0) {
      this.logger.warn(`[DELETE] Found ${messages.length} message(s) to delete from Chatwoot message ${body.id}`);
      this.logger.verbose(`[DELETE] Messages keys: ${messages.map((m) => (m.key as any)?.id).join(', ')}`);

      // Deletar cada mensagem no WhatsApp
      for (const message of messages) {
        const key = message.key as WAMessageKey;
        this.logger.warn(
          `[DELETE] Attempting to delete WhatsApp message - keyId: ${key?.id}, remoteJid: ${key?.remoteJid}`,
        );

        try {
          await waInstance?.client.sendMessage(key.remoteJid, { delete: key });
          this.logger.warn(`[DELETE] ✅ Message ${key.id} deleted in WhatsApp successfully`);
        } catch (error) {
          this.logger.error(`[DELETE] ❌ Error deleting message ${key.id} in WhatsApp: ${error}`);
          this.logger.error(`[DELETE] Error details: ${JSON.stringify(error, null, 2)}`);
        }
      }

      // Remover todas as mensagens do banco de dados
      await this.prismaRepository.message.deleteMany({
        where: {
          instanceId: instance.instanceId,
          chatwootMessageId: body.id,
        },
      });
      this.logger.warn(`[DELETE] ✅ SUCCESS: ${messages.length} message(s) deleted from WhatsApp and database`);
    } else {
      // Mensagem não encontrada - pode ser uma mensagem antiga que foi substituída por edição
      this.logger.warn(`[DELETE] ⚠️ WARNING: Message not found in DB - chatwootMessageId: ${body.id}`);
    }

    // Liberar lock após processar
    await this.cache.delete(deleteLockKey);
  }

  public async receiveWebhook(instance: InstanceDto, body: any) {
    try {
      // IMPORTANTE: Verificar lock de deleção ANTES do delay inicial
      // para evitar race condition com webhooks duplicados
      let isDeletionEvent = false;
      if (body.event === 'message_updated' && body.content_attributes?.deleted) {
        isDeletionEvent = true;
        const deleteLockKey = `${instance.instanceName}:deleteMessage-${body.id}`;

        // Verificar se já está processando esta deleção
        if (await this.cache.has(deleteLockKey)) {
          this.logger.warn(`[DELETE] ⏭️ SKIPPING: Deletion already in progress for messageId: ${body.id}`);
          return { message: 'already_processing' };
        }

        // Adquirir lock IMEDIATAMENTE por 30 segundos
        await this.cache.set(deleteLockKey, true, 30);

        this.logger.warn(
          `[WEBHOOK-DELETE] Event: ${body.event}, messageId: ${body.id}, conversation: ${body.conversation?.id}`,
        );
      }

      // Para deleções, processar IMEDIATAMENTE (sem delay)
      // Para outros eventos, aguardar delay inicial
      if (!isDeletionEvent) {
        await new Promise((resolve) => setTimeout(resolve, this.WEBHOOK_INITIAL_DELAY_MS));
      }

      const client = await this.clientCw(instance);

      if (!client) {
        this.logger.warn('client not found');
        return null;
      }

      if (
        this.provider.reopenConversation === false &&
        body.event === 'conversation_status_changed' &&
        body.status === 'resolved' &&
        body.meta?.sender?.identifier
      ) {
        const keyToDelete = `${instance.instanceName}:createConversation-${body.meta.sender.identifier}`;
        this.cache.delete(keyToDelete);
      }

      // Log para debug de mensagens deletadas
      if (body.event === 'message_updated') {
        this.logger.verbose(
          `Message updated event - deleted: ${body.content_attributes?.deleted}, messageId: ${body.id}`,
        );
      }

      // Processar deleção de mensagem ANTES das outras validações
      if (body.event === 'message_updated' && body.content_attributes?.deleted) {
        // Lock já foi adquirido no início do método (antes do delay)
        const deleteLockKey = `${instance.instanceName}:deleteMessage-${body.id}`;

        // ESTRATÉGIA: Processar em background e responder IMEDIATAMENTE
        // Isso evita timeout do Chatwoot (5s) quando há muitas imagens (> 5s de processamento)
        this.logger.warn(`[DELETE] 🚀 Starting background deletion - messageId: ${body.id}`);

        // Executar em background (sem await) - não bloqueia resposta do webhook
        setImmediate(async () => {
          try {
            await this.processDeletion(instance, body, deleteLockKey);
          } catch (error) {
            this.logger.error(`[DELETE] ❌ Background deletion failed for messageId ${body.id}: ${error}`);
          }
        });

        // RESPONDER IMEDIATAMENTE ao Chatwoot (< 50ms)
        return {
          message: 'deletion_accepted',
          messageId: body.id,
          note: 'Deletion is being processed in background',
        };
      }

      if (
        !body?.conversation ||
        body.private ||
        (body.event === 'message_updated' && !body.content_attributes?.deleted)
      ) {
        return { message: 'bot' };
      }

      const chatId =
        body.conversation.meta.sender?.identifier || body.conversation.meta.sender?.phone_number.replace('+', '');
      // Chatwoot to Whatsapp
      const messageReceived = body.content
        ? body.content
            .replaceAll(/(?<!\*)\*((?!\s)([^\n*]+?)(?<!\s))\*(?!\*)/g, '_$1_') // Substitui * por _
            .replaceAll(/\*{2}((?!\s)([^\n*]+?)(?<!\s))\*{2}/g, '*$1*') // Substitui ** por *
            .replaceAll(/~{2}((?!\s)([^\n*]+?)(?<!\s))~{2}/g, '~$1~') // Substitui ~~ por ~
            .replaceAll(/(?<!`)`((?!\s)([^`*]+?)(?<!\s))`(?!`)/g, '```$1```') // Substitui ` por ```
        : body.content;

      const senderName = body?.conversation?.messages[0]?.sender?.available_name || body?.sender?.name;
      const waInstance = this.waMonitor.waInstances[instance.instanceName];

      if (body.event === 'message_updated' && body.content_attributes?.deleted) {
        const message = await this.prismaRepository.message.findFirst({
          where: {
            chatwootMessageId: body.id,
            instanceId: instance.instanceId,
          },
        });

        if (message) {
          const key = message.key as WAMessageKey;

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
        const command = messageReceived.replace('/', '');

        if (cwBotContact && (command.includes('init') || command.includes('iniciar'))) {
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
          const state = waInstance?.connectionStatus?.state;

          if (!state) {
            await this.createBotMessage(
              instance,
              i18next.t('cw.inbox.notFound', {
                inboxName: body.inbox.name,
              }),
              'incoming',
            );
          }

          if (state) {
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
          const msgLogout = i18next.t('cw.inbox.disconnect', {
            inboxName: body.inbox.name,
          });

          await this.createBotMessage(instance, msgLogout, 'incoming');

          await waInstance?.client?.logout('Log out instance: ' + instance.instanceName);
          await waInstance?.client?.ws?.close();
        }
      }

      if (body.message_type === 'outgoing' && body?.conversation?.messages?.length && chatId !== '123456') {
        if (
          body?.conversation?.messages[0]?.source_id?.substring(0, 5) === 'WAID:' &&
          body?.conversation?.messages[0]?.id === body?.id
        ) {
          return { message: 'bot' };
        }

        if (!waInstance && body.conversation?.id) {
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
            // Processa anexos de forma assíncrona para não bloquear o webhook
            const processAttachments = async () => {
              for (const attachment of message.attachments) {
                if (!messageReceived) {
                  formatText = null;
                }

                const options: Options = {
                  quoted: await this.getQuotedMessage(body, instance),
                };

                try {
                  const messageSent = await this.sendAttachment(
                    waInstance,
                    chatId,
                    attachment.data_url,
                    formatText,
                    options,
                  );

                  if (!messageSent && body.conversation?.id) {
                    this.onSendMessageError(instance, body.conversation?.id);
                  }

                  if (messageSent) {
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
                } catch (error) {
                  this.logger.error(error);
                  if (body.conversation?.id) {
                    this.onSendMessageError(instance, body.conversation?.id, error);
                  }
                }
              }
            };

            // Executa em background sem bloquear
            processAttachments().catch((error) => {
              this.logger.error(error);
            });
          } else {
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
                messageSent, // Já tem instanceId
                {
                  messageId: body.id,
                  inboxId: body.inbox?.id,
                  conversationId: body.conversation?.id,
                  contactInboxSourceId: body.conversation?.contact_inbox?.source_id,
                },
                instance,
              );
            } catch (error) {
              if (!messageSent && body.conversation?.id) {
                this.onSendMessageError(instance, body.conversation?.id, error);
              }
              throw error;
            }
          }
        }

        const chatwootRead = this.configService.get<Chatwoot>('CHATWOOT').MESSAGE_READ;
        if (chatwootRead) {
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
            const key = lastMessage.key as WAMessageKey;

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
        const data: SendTextDto = {
          number: chatId,
          text: body.content.replace(/\\\r\n|\\\n|\n/g, '\n'),
          delay: 1200,
        };

        sendTelemetry('/message/sendText');

        await waInstance?.textMessage(data);
      }

      return { message: 'bot' };
    } catch (error) {
      this.logger.error(error);

      return { message: 'bot' };
    }
  }

  private async updateChatwootMessageId(
    message: MessageModel,
    chatwootMessageIds: ChatwootMessage,
    instance: InstanceDto,
  ) {
    const key = message.key as WAMessageKey;

    if (!chatwootMessageIds.messageId || !key?.id) {
      this.logger.verbose(
        `Skipping updateChatwootMessageId - messageId: ${chatwootMessageIds.messageId}, keyId: ${key?.id}`,
      );
      return;
    }

    // Use instanceId from message or fallback to instance
    const instanceId = message.instanceId || instance.instanceId;

    this.logger.verbose(
      `Updating message with chatwootMessageId: ${chatwootMessageIds.messageId}, keyId: ${key.id}, instanceId: ${instanceId}`,
    );

    // Verifica se a mensagem existe antes de atualizar usando polling com exponential backoff
    let retries = 0;
    const maxRetries = this.DB_POLLING_MAX_RETRIES;
    const baseDelay = this.DB_POLLING_BASE_DELAY_MS;
    const maxDelay = this.DB_POLLING_MAX_DELAY_MS;
    let messageExists = false;

    while (retries < maxRetries && !messageExists) {
      const existingMessage = await this.prismaRepository.message.findFirst({
        where: {
          instanceId: instanceId,
          key: {
            path: ['id'],
            equals: key.id,
          },
        },
      });

      if (existingMessage) {
        messageExists = true;
        this.logger.verbose(`Message found in database after ${retries} retries`);
      } else {
        retries++;
        if (retries < maxRetries) {
          // Exponential backoff com max delay (seguindo padrão do sistema)
          const backoffDelay = Math.min(baseDelay * Math.pow(2, retries - 1), maxDelay);
          this.logger.verbose(`Message not found, retry ${retries}/${maxRetries} in ${backoffDelay}ms`);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        } else {
          this.logger.verbose(`Message not found after ${retries} attempts`);
        }
      }
    }

    if (!messageExists) {
      this.logger.warn(`Message not found in database after ${maxRetries} retries, keyId: ${key.id}`);
      return;
    }

    // Use raw SQL to avoid JSON path issues
    const result = await this.prismaRepository.$executeRaw`
      UPDATE "Message" 
      SET 
        "chatwootMessageId" = ${chatwootMessageIds.messageId},
        "chatwootConversationId" = ${chatwootMessageIds.conversationId},
        "chatwootInboxId" = ${chatwootMessageIds.inboxId},
        "chatwootContactInboxSourceId" = ${chatwootMessageIds.contactInboxSourceId},
        "chatwootIsRead" = ${chatwootMessageIds.isRead || false}
      WHERE "instanceId" = ${instanceId} 
      AND "key"->>'id' = ${key.id}
    `;

    this.logger.verbose(`Update result: ${result} rows affected`);

    if (this.isImportHistoryAvailable()) {
      chatwootImport.updateMessageSourceID(chatwootMessageIds.messageId, key.id);
    }
  }

  private async getMessageByKeyId(instance: InstanceDto, keyId: string): Promise<MessageModel> {
    // Use raw SQL query to avoid JSON path issues with Prisma
    const messages = await this.prismaRepository.$queryRaw`
      SELECT * FROM "Message" 
      WHERE "instanceId" = ${instance.instanceId} 
      AND "key"->>'id' = ${keyId}
      LIMIT 1
    `;

    return (messages as MessageModel[])[0] || null;
  }

  private async getReplyToIds(
    msg: any,
    instance: InstanceDto,
  ): Promise<{ in_reply_to: string; in_reply_to_external_id: string }> {
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
    if (msg?.content_attributes?.in_reply_to) {
      const message = await this.prismaRepository.message.findFirst({
        where: {
          chatwootMessageId: msg?.content_attributes?.in_reply_to,
          instanceId: instance.instanceId,
        },
      });

      const key = message?.key as WAMessageKey;

      if (message && key?.id) {
        return {
          key: message.key as proto.IMessageKey,
          message: message.message as proto.IMessage,
        };
      }
    }

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
      audioMessage: msg.audioMessage ? (msg.audioMessage.caption ?? '') : undefined,
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

    // Remove externalAdReplyBody| in Chatwoot (Already Have)
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
    const types = this.getTypeMessage(msg);

    const messageContent = this.getMessageContent(types);

    return messageContent;
  }

  public async eventWhatsapp(event: string, instance: InstanceDto, body: any) {
    try {
      const waInstance = this.waMonitor.waInstances[instance.instanceName];

      if (!waInstance) {
        this.logger.warn('wa instance not found');
        return null;
      }

      const client = await this.clientCw(instance);

      if (!client) {
        this.logger.warn('client not found');
        return null;
      }

      if (this.provider?.ignoreJids && this.provider?.ignoreJids.length > 0) {
        const ignoreJids: any = this.provider?.ignoreJids;

        let ignoreGroups = false;
        let ignoreContacts = false;

        if (ignoreJids.includes('@g.us')) {
          ignoreGroups = true;
        }

        if (ignoreJids.includes('@s.whatsapp.net')) {
          ignoreContacts = true;
        }

        if (ignoreGroups && body?.key?.remoteJid.endsWith('@g.us')) {
          this.logger.warn('Ignoring message from group: ' + body?.key?.remoteJid);
          return;
        }

        if (ignoreContacts && body?.key?.remoteJid.endsWith('@s.whatsapp.net')) {
          this.logger.warn('Ignoring message from contact: ' + body?.key?.remoteJid);
          return;
        }

        if (ignoreJids.includes(body?.key?.remoteJid)) {
          this.logger.warn('Ignoring message from jid: ' + body?.key?.remoteJid);
          return;
        }
      }

      if (event === 'messages.upsert' || event === 'send.message') {
        this.logger.info(`[${event}] New message received - Instance: ${JSON.stringify(body, null, 2)}`);
        if (body.key.remoteJid === 'status@broadcast') {
          return;
        }

        if (body.message?.ephemeralMessage?.message) {
          body.message = {
            ...body.message?.ephemeralMessage?.message,
          };
        }

        const originalMessage = await this.getConversationMessage(body.message);
        const bodyMessage = originalMessage
          ? originalMessage
              .replaceAll(/\*((?!\s)([^\n*]+?)(?<!\s))\*/g, '**$1**')
              .replaceAll(/_((?!\s)([^\n_]+?)(?<!\s))_/g, '*$1*')
              .replaceAll(/~((?!\s)([^\n~]+?)(?<!\s))~/g, '~~$1~~')
          : originalMessage;

        if (bodyMessage && bodyMessage.includes('/survey/responses/') && bodyMessage.includes('http')) {
          return;
        }

        const quotedId = body.contextInfo?.stanzaId || body.message?.contextInfo?.stanzaId;

        let quotedMsg = null;

        if (quotedId)
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

        const isMedia = this.isMediaMessage(body.message);

        const adsMessage = this.getAdsMessage(body);

        const reactionMessage = this.getReactionMessage(body.message);

        if (!bodyMessage && !isMedia && !reactionMessage) {
          this.logger.warn('no body message found');
          return;
        }

        const getConversation = await this.createConversation(instance, body);

        if (!getConversation) {
          this.logger.warn('conversation not found');
          return;
        }

        const messageType = body.key.fromMe ? 'outgoing' : 'incoming';

        if (isMedia) {
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
            nameFile = `${Math.random().toString(36).substring(7)}.${mimeTypes.extension(downloadBase64.mimetype) || ''}`;
          }

          const fileData = Buffer.from(downloadBase64.base64, 'base64');

          const fileStream = new Readable();
          fileStream._read = () => {};
          fileStream.push(fileData);
          fileStream.push(null);

          if (body.key.remoteJid.includes('@g.us')) {
            const participantName = body.pushName;
            const rawPhoneNumber = body.key.participant.split('@')[0];
            const phoneMatch = rawPhoneNumber.match(/^(\d{2})(\d{2})(\d{4})(\d{4})$/);

            let formattedPhoneNumber: string;

            if (phoneMatch) {
              formattedPhoneNumber = `+${phoneMatch[1]} (${phoneMatch[2]}) ${phoneMatch[3]}-${phoneMatch[4]}`;
            } else {
              formattedPhoneNumber = `+${rawPhoneNumber}`;
            }

            let content: string;

            if (!body.key.fromMe) {
              content = `**${formattedPhoneNumber} - ${participantName}:**\n\n${bodyMessage}`;
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
              this.logger.warn('message not sent');
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
              this.logger.warn('message not sent');
              return;
            }

            return send;
          }
        }

        if (reactionMessage) {
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
              this.logger.warn('message not sent');
              return;
            }
          }

          return;
        }

        const isAdsMessage = (adsMessage && adsMessage.title) || adsMessage.body || adsMessage.thumbnailUrl;
        if (isAdsMessage) {
          const imgBuffer = await axios.get(adsMessage.thumbnailUrl, { responseType: 'arraybuffer' });

          const extension = mimeTypes.extension(imgBuffer.headers['content-type']);
          const mimeType = extension && mimeTypes.lookup(extension);

          if (!mimeType) {
            this.logger.warn('mimetype of Ads message not found');
            return;
          }

          const random = Math.random().toString(36).substring(7);
          const nameFile = `${random}.${mimeTypes.extension(mimeType)}`;
          const fileData = Buffer.from(imgBuffer.data, 'binary');

          const img = await Jimp.read(fileData);
          await img.cover({
            w: 320,
            h: 180,
          });
          const processedBuffer = await img.getBuffer(JimpMime.png);

          const fileStream = new Readable();
          fileStream._read = () => {}; // _read is required but you can noop it
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
            this.logger.warn('message not sent');
            return;
          }

          return send;
        }

        if (body.key.remoteJid.includes('@g.us')) {
          const participantName = body.pushName;
          const rawPhoneNumber = body.key.participant.split('@')[0];
          const phoneMatch = rawPhoneNumber.match(/^(\d{2})(\d{2})(\d{4})(\d{4})$/);

          let formattedPhoneNumber: string;

          if (phoneMatch) {
            formattedPhoneNumber = `+${phoneMatch[1]} (${phoneMatch[2]}) ${phoneMatch[3]}-${phoneMatch[4]}`;
          } else {
            formattedPhoneNumber = `+${rawPhoneNumber}`;
          }

          let content: string;

          if (!body.key.fromMe) {
            content = `**${formattedPhoneNumber} - ${participantName}:**\n\n${bodyMessage}`;
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
            this.logger.warn('message not sent');
            return;
          }

          return send;
        } else {
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
            this.logger.warn('message not sent');
            return;
          }

          return send;
        }
      }

      if (event === Events.MESSAGES_DELETE) {
        const chatwootDelete = this.configService.get<Chatwoot>('CHATWOOT').MESSAGE_DELETE;

        if (chatwootDelete === true) {
          if (!body?.key?.id) {
            this.logger.warn('message id not found');
            return;
          }

          const message = await this.getMessageByKeyId(instance, body.key.id);

          if (message?.chatwootMessageId && message?.chatwootConversationId) {
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

      if (event === 'messages.edit' || event === 'send.message.update') {
        const editedMessageContent =
          body?.editedMessage?.conversation || body?.editedMessage?.extendedTextMessage?.text;
        const message = await this.getMessageByKeyId(instance, body?.key?.id);

        if (!message) {
          this.logger.warn('Message not found for edit event');
          return;
        }

        const key = message.key as WAMessageKey;

        const messageType = key?.fromMe ? 'outgoing' : 'incoming';

        if (message && message.chatwootConversationId && message.chatwootMessageId) {
          // Criar nova mensagem com formato: "Mensagem editada:\n\nteste1"
          const editedText = `\n\n\`${i18next.t('cw.message.edited')}:\`\n\n${editedMessageContent}`;

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
            this.logger.warn('edited message not sent');
            return;
          }
        }
        return;
      }

      if (event === 'messages.read') {
        if (!body?.key?.id || !body?.key?.remoteJid) {
          this.logger.warn('message id not found');
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
            const conversation = (await client.conversations.get({
              accountId: this.provider.accountId,
              conversationId: conversationId,
            })) as conversation_show & {
              last_non_activity_message: { conversation: { contact_inbox: contact_inboxes } };
            };
            sourceId = conversation.last_non_activity_message?.conversation?.contact_inbox?.source_id;
          }

          if (sourceId && inbox?.inbox_identifier) {
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
        const data = body;
        const inbox = await this.getInbox(instance);

        if (!inbox) {
          this.logger.warn('inbox not found');
          return;
        }

        const msgStatus = i18next.t('cw.inbox.status', {
          inboxName: inbox.name,
          state: data.status,
        });

        await this.createBotMessage(instance, msgStatus, 'incoming');
      }

      if (event === 'connection.update' && body.status === 'open') {
        const waInstance = this.waMonitor.waInstances[instance.instanceName];
        if (!waInstance) return;

        const now = Date.now();
        const timeSinceLastNotification = now - (waInstance.lastConnectionNotification || 0);

        // Se a conexão foi estabelecida via QR code, notifica imediatamente.
        if (waInstance.qrCode && waInstance.qrCode.count > 0) {
          const msgConnection = i18next.t('cw.inbox.connected');
          await this.createBotMessage(instance, msgConnection, 'incoming');
          waInstance.qrCode.count = 0;
          waInstance.lastConnectionNotification = now;
          chatwootImport.clearAll(instance);
        }
        // Se não foi via QR code, verifica o throttling.
        else if (timeSinceLastNotification >= MIN_CONNECTION_NOTIFICATION_INTERVAL_MS) {
          const msgConnection = i18next.t('cw.inbox.connected');
          await this.createBotMessage(instance, msgConnection, 'incoming');
          waInstance.lastConnectionNotification = now;
        } else {
          this.logger.warn(
            `Connection notification skipped for ${instance.instanceName} - too frequent (${timeSinceLastNotification}ms since last)`,
          );
        }
      }

      if (event === 'qrcode.updated') {
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
            msgQrCode =
              msgQrCode +
              `\n\n*Pairing Code:* ${body.qrcode.pairingCode.substring(0, 4)}-${body.qrcode.pairingCode.substring(
                4,
                8,
              )}`;
          }

          await this.createBotMessage(instance, msgQrCode, 'incoming');
        }
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  public getNumberFromRemoteJid(remoteJid: string) {
    return remoteJid.replace(/:\d+/, '').split('@')[0];
  }

  public startImportHistoryMessages(instance: InstanceDto) {
    if (!this.isImportHistoryAvailable()) {
      return;
    }

    this.createBotMessage(instance, i18next.t('cw.import.startImport'), 'incoming');
  }

  public isImportHistoryAvailable() {
    const uri = this.configService.get<Chatwoot>('CHATWOOT').IMPORT.DATABASE.CONNECTION.URI;

    return uri && uri !== 'postgres://user:password@hostname:port/dbname';
  }

  public addHistoryMessages(instance: InstanceDto, messagesRaw: MessageModel[]) {
    if (!this.isImportHistoryAvailable()) {
      return;
    }

    chatwootImport.addHistoryMessages(instance, messagesRaw);
  }

  public addHistoryContacts(instance: InstanceDto, contactsRaw: ContactModel[]) {
    if (!this.isImportHistoryAvailable()) {
      return;
    }

    return chatwootImport.addHistoryContacts(instance, contactsRaw);
  }

  public async importHistoryMessages(instance: InstanceDto) {
    if (!this.isImportHistoryAvailable()) {
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
      if (!this.isImportHistoryAvailable()) {
        return;
      }

      const client = await this.clientCw(instance);
      if (!client) {
        this.logger.warn('client not found');
        return null;
      }

      const inbox = await this.getInbox(instance);
      if (!inbox) {
        this.logger.warn('inbox not found');
        return null;
      }

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
      this.logger.error(`Error on update avatar in recent conversations: ${error.toString()}`);
    }
  }

  public async syncLostMessages(
    instance: InstanceDto,
    chatwootConfig: ChatwootDto,
    prepareMessage: (message: any) => any,
  ) {
    try {
      if (!this.isImportHistoryAvailable()) {
        return;
      }
      if (!this.configService.get<Database>('DATABASE').SAVE_DATA.MESSAGE_UPDATE) {
        return;
      }

      const inbox = await this.getInbox(instance);

      const sqlMessages = `select * from messages m
      where account_id = ${chatwootConfig.accountId}
      and inbox_id = ${inbox.id}
      and created_at >= now() - interval '6h'
      order by created_at desc`;

      const messagesData = (await this.pgClient.query(sqlMessages))?.rows;
      const ids: string[] = messagesData
        .filter((message) => !!message.source_id)
        .map((message) => message.source_id.replace('WAID:', ''));

      const savedMessages = await this.prismaRepository.message.findMany({
        where: {
          Instance: { name: instance.instanceName },
          messageTimestamp: { gte: Number(dayjs().subtract(6, 'hours').unix()) },
          AND: ids.map((id) => ({ key: { path: ['id'], not: id } })),
        },
      });

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

      this.addHistoryMessages(
        instance,
        messagesRaw.filter((msg) => !chatwootImport.isIgnorePhoneNumber(msg.key?.remoteJid)),
      );

      await chatwootImport.importHistoryMessages(instance, this, inbox, this.provider);
      const waInstance = this.waMonitor.waInstances[instance.instanceName];
      waInstance.clearCacheChatwoot();
    } catch {
      return;
    }
  }
}
