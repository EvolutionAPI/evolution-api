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
import axios from 'axios';
import { proto } from 'baileys';
import FormData from 'form-data';
import { createReadStream, unlinkSync, writeFileSync } from 'fs';
import Jimp from 'jimp';
import mimeTypes from 'mime-types';
import path from 'path';

import { Chatwoot, ConfigService, HttpServer } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import i18next from '../../../../utils/i18n';
import { ICache } from '../../../abstract/abstract.cache';
import { InstanceDto } from '../../../dto/instance.dto';
import { Options, Quoted, SendAudioDto, SendMediaDto, SendTextDto } from '../../../dto/sendMessage.dto';
import { ChatwootRaw, ContactRaw, MessageRaw } from '../../../models';
import { RepositoryBroker } from '../../../repository/repository.manager';
import { WAMonitoringService } from '../../../services/monitor.service';
import { Events } from '../../../types/wa.types';
import { ChatwootDto } from '../dto/chatwoot.dto';
import { chatwootImport } from '../utils/chatwoot-import-helper';

export class ChatwootService {
  private readonly logger = new Logger(ChatwootService.name);

  private provider: any;

  constructor(
    private readonly waMonitor: WAMonitoringService,
    private readonly configService: ConfigService,
    private readonly repository: RepositoryBroker,
    private readonly cache: ICache,
  ) {}

  private async getProvider(instance: InstanceDto) {
    const cacheKey = `${instance.instanceName}:getProvider`;
    if (await this.cache.has(cacheKey)) {
      return (await this.cache.get(cacheKey)) as ChatwootRaw;
    }

    this.logger.verbose('get provider to instance: ' + instance.instanceName);
    const provider = await this.waMonitor.waInstances[instance.instanceName]?.findChatwoot();

    if (!provider) {
      this.logger.warn('provider not found');
      return null;
    }

    this.logger.verbose('provider found');

    this.cache.set(cacheKey, provider);

    return provider;
  }

  private async clientCw(instance: InstanceDto) {
    this.logger.verbose('get client to instance: ' + instance.instanceName);

    const provider = await this.getProvider(instance);

    if (!provider) {
      this.logger.error('provider not found');
      return null;
    }

    this.logger.verbose('provider found');

    this.provider = provider;

    this.logger.verbose('create client to instance: ' + instance.instanceName);
    const client = new ChatwootClient({
      config: this.getClientCwConfig(),
    });

    this.logger.verbose('client created');

    return client;
  }

  public getClientCwConfig(): ChatwootAPIConfig & { name_inbox: string; merge_brazil_contacts: boolean } {
    return {
      basePath: this.provider.url,
      with_credentials: true,
      credentials: 'include',
      token: this.provider.token,
      name_inbox: this.provider.name_inbox,
      merge_brazil_contacts: this.provider.merge_brazil_contacts,
    };
  }

  public getCache() {
    return this.cache;
  }

  public async create(instance: InstanceDto, data: ChatwootDto) {
    this.logger.verbose('create chatwoot: ' + instance.instanceName);

    await this.waMonitor.waInstances[instance.instanceName].setChatwoot(data);

    this.logger.verbose('chatwoot created');

    if (data.auto_create) {
      const urlServer = this.configService.get<HttpServer>('SERVER').URL;

      await this.initInstanceChatwoot(
        instance,
        data.name_inbox ?? instance.instanceName.split('-cwId-')[0],
        `${urlServer}/chatwoot/webhook/${encodeURIComponent(instance.instanceName)}`,
        true,
        data.number,
      );
    }
    return data;
  }

  public async find(instance: InstanceDto): Promise<ChatwootDto> {
    this.logger.verbose('find chatwoot: ' + instance.instanceName);
    try {
      return await this.waMonitor.waInstances[instance.instanceName].findChatwoot();
    } catch (error) {
      this.logger.error('chatwoot not found');
      return { enabled: null, url: '' };
    }
  }

  public async getContact(instance: InstanceDto, id: number) {
    this.logger.verbose('get contact to instance: ' + instance.instanceName);
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    if (!id) {
      this.logger.warn('id is required');
      return null;
    }

    this.logger.verbose('find contact in chatwoot');
    const contact = await client.contact.getContactable({
      accountId: this.provider.account_id,
      id,
    });

    if (!contact) {
      this.logger.warn('contact not found');
      return null;
    }

    this.logger.verbose('contact found');
    return contact;
  }

  public async initInstanceChatwoot(
    instance: InstanceDto,
    inboxName: string,
    webhookUrl: string,
    qrcode: boolean,
    number: string,
  ) {
    this.logger.verbose('init instance chatwoot: ' + instance.instanceName);

    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    this.logger.verbose('find inbox in chatwoot');
    const findInbox: any = await client.inboxes.list({
      accountId: this.provider.account_id,
    });

    this.logger.verbose('check duplicate inbox');
    const checkDuplicate = findInbox.payload.map((inbox) => inbox.name).includes(inboxName);

    let inboxId: number;

    if (!checkDuplicate) {
      this.logger.verbose('create inbox in chatwoot');
      const data = {
        type: 'api',
        webhook_url: webhookUrl,
      };

      const inbox = await client.inboxes.create({
        accountId: this.provider.account_id,
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
      this.logger.verbose('find inbox in chatwoot');
      const inbox = findInbox.payload.find((inbox) => inbox.name === inboxName);

      if (!inbox) {
        this.logger.warn('inbox not found');
        return null;
      }

      inboxId = inbox.id;
    }

    this.logger.verbose('find contact in chatwoot and create if not exists');
    const contact =
      (await this.findContact(instance, '123456')) ||
      ((await this.createContact(
        instance,
        '123456',
        inboxId,
        false,
        'EvolutionAPI',
        'https://evolution-api.com/files/evolution-api-favicon.png',
      )) as any);

    if (!contact) {
      this.logger.warn('contact not found');
      return null;
    }

    const contactId = contact.id || contact.payload.contact.id;

    if (qrcode) {
      this.logger.verbose('create conversation in chatwoot');
      const data = {
        contact_id: contactId.toString(),
        inbox_id: inboxId.toString(),
      };

      const conversation = await client.conversations.create({
        accountId: this.provider.account_id,
        data,
      });

      if (!conversation) {
        this.logger.warn('conversation not found');
        return null;
      }

      this.logger.verbose('create message for init instance in chatwoot');

      let contentMsg = 'init';

      if (number) {
        contentMsg = `init:${number}`;
      }

      const message = await client.messages.create({
        accountId: this.provider.account_id,
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
    }

    this.logger.verbose('instance chatwoot initialized');
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
    this.logger.verbose('create contact to instance: ' + instance.instanceName);

    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    let data: any = {};
    if (!isGroup) {
      this.logger.verbose('create contact in chatwoot');
      data = {
        inbox_id: inboxId,
        name: name || phoneNumber,
        phone_number: `+${phoneNumber}`,
        identifier: jid,
        avatar_url: avatar_url,
      };
    } else {
      this.logger.verbose('create contact group in chatwoot');
      data = {
        inbox_id: inboxId,
        name: name || phoneNumber,
        identifier: phoneNumber,
        avatar_url: avatar_url,
      };
    }

    this.logger.verbose('create contact in chatwoot');
    const contact = await client.contacts.create({
      accountId: this.provider.account_id,
      data,
    });

    if (!contact) {
      this.logger.warn('contact not found');
      return null;
    }

    this.logger.verbose('contact created');
    return contact;
  }

  public async updateContact(instance: InstanceDto, id: number, data: any) {
    this.logger.verbose('update contact to instance: ' + instance.instanceName);
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    if (!id) {
      this.logger.warn('id is required');
      return null;
    }

    this.logger.verbose('update contact in chatwoot');
    try {
      const contact = await client.contacts.update({
        accountId: this.provider.account_id,
        id,
        data,
      });

      this.logger.verbose('contact updated');
      return contact;
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async findContact(instance: InstanceDto, phoneNumber: string) {
    this.logger.verbose('find contact to instance: ' + instance.instanceName);

    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    let query: any;
    const isGroup = phoneNumber.includes('@g.us');

    if (!isGroup) {
      this.logger.verbose('format phone number');
      query = `+${phoneNumber}`;
    } else {
      this.logger.verbose('format group id');
      query = phoneNumber;
    }

    this.logger.verbose('find contact in chatwoot');
    let contact: any;

    if (isGroup) {
      contact = await client.contacts.search({
        accountId: this.provider.account_id,
        q: query,
      });
    } else {
      // hotfix for: https://github.com/EvolutionAPI/evolution-api/pull/382. waiting fix: https://github.com/figurolatam/chatwoot-sdk/pull/7
      contact = await chatwootRequest(this.getClientCwConfig(), {
        method: 'POST',
        url: `/api/v1/accounts/${this.provider.account_id}/contacts/filter`,
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
      this.logger.verbose('return contact');
      return contact.payload.length > 1 ? this.findContactInContactList(contact.payload, query) : contact.payload[0];
    } else {
      this.logger.verbose('return group');
      return contact.payload.find((contact) => contact.identifier === query);
    }
  }

  private async mergeBrazilianContacts(contacts: any[]) {
    try {
      //sdk chatwoot não tem função merge
      this.logger.verbose('merging contacts');
      const contact = await chatwootRequest(this.getClientCwConfig(), {
        method: 'POST',
        url: `/api/v1/accounts/${this.provider.account_id}/actions/contact_merge`,
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
    if (contacts.length === 2 && this.getClientCwConfig().merge_brazil_contacts && query.startsWith('+55')) {
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
    this.logger.verbose('create conversation to instance: ' + instance.instanceName);
    try {
      const client = await this.clientCw(instance);

      if (!client) {
        this.logger.warn('client not found');
        return null;
      }

      const cacheKey = `${instance.instanceName}:createConversation-${body.key.remoteJid}`;
      if (await this.cache.has(cacheKey)) {
        const conversationId = (await this.cache.get(cacheKey)) as number;
        let conversationExists: conversation | boolean;
        try {
          conversationExists = await client.conversations.get({
            accountId: this.provider.account_id,
            conversationId: conversationId,
          });
        } catch (error) {
          conversationExists = false;
        }
        if (!conversationExists) {
          this.cache.delete(cacheKey);
          return await this.createConversation(instance, body);
        }

        return conversationId;
      }

      const isGroup = body.key.remoteJid.includes('@g.us');

      this.logger.verbose('is group: ' + isGroup);

      const chatId = isGroup ? body.key.remoteJid : body.key.remoteJid.split('@')[0];

      this.logger.verbose('chat id: ' + chatId);

      let nameContact: string;

      nameContact = !body.key.fromMe ? body.pushName : chatId;

      this.logger.verbose('get inbox to instance: ' + instance.instanceName);
      const filterInbox = await this.getInbox(instance);

      if (!filterInbox) {
        this.logger.warn('inbox not found');
        return null;
      }

      if (isGroup) {
        this.logger.verbose('get group name');
        const group = await this.waMonitor.waInstances[instance.instanceName].client.groupMetadata(chatId);

        nameContact = `${group.subject} (GROUP)`;

        this.logger.verbose('find or create participant in chatwoot');

        const picture_url = await this.waMonitor.waInstances[instance.instanceName].profilePicture(
          body.key.participant.split('@')[0],
        );

        const findParticipant = await this.findContact(instance, body.key.participant.split('@')[0]);

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

      this.logger.verbose('find or create contact in chatwoot');

      const picture_url = await this.waMonitor.waInstances[instance.instanceName].profilePicture(chatId);

      let contact = await this.findContact(instance, chatId);

      if (contact) {
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

          const contactNeedsUpdate = pictureNeedsUpdate || nameNeedsUpdate;
          if (contactNeedsUpdate) {
            this.logger.verbose('update contact in chatwoot');
            contact = await this.updateContact(instance, contact.id, {
              ...(nameNeedsUpdate && { name: nameContact }),
              ...(waProfilePictureFile === '' && { avatar: null }),
              ...(pictureNeedsUpdate && { avatar_url: picture_url?.profilePictureUrl }),
            });
          }
        }
      } else {
        const jid = isGroup ? null : body.key.remoteJid;
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
        this.logger.warn('contact not found');
        return null;
      }

      const contactId = contact?.payload?.id || contact?.payload?.contact?.id || contact?.id;

      this.logger.verbose('get contact conversations in chatwoot');
      const contactConversations = (await client.contacts.listConversations({
        accountId: this.provider.account_id,
        id: contactId,
      })) as any;

      if (contactConversations?.payload?.length) {
        let conversation: any;
        if (this.provider.reopen_conversation) {
          conversation = contactConversations.payload.find((conversation) => conversation.inbox_id == filterInbox.id);

          if (this.provider.conversation_pending) {
            await client.conversations.toggleStatus({
              accountId: this.provider.account_id,
              conversationId: conversation.id,
              data: {
                status: 'pending',
              },
            });
          }
        } else {
          conversation = contactConversations.payload.find(
            (conversation) => conversation.status !== 'resolved' && conversation.inbox_id == filterInbox.id,
          );
        }
        this.logger.verbose('return conversation if exists');

        if (conversation) {
          this.logger.verbose('conversation found');
          this.cache.set(cacheKey, conversation.id);
          return conversation.id;
        }
      }

      this.logger.verbose('create conversation in chatwoot');
      const data = {
        contact_id: contactId.toString(),
        inbox_id: filterInbox.id.toString(),
      };

      if (this.provider.conversation_pending) {
        data['status'] = 'pending';
      }

      const conversation = await client.conversations.create({
        accountId: this.provider.account_id,
        data,
      });

      if (!conversation) {
        this.logger.warn('conversation not found');
        return null;
      }

      this.logger.verbose('conversation created');
      this.cache.set(cacheKey, conversation.id);
      return conversation.id;
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async getInbox(instance: InstanceDto) {
    this.logger.verbose('get inbox to instance: ' + instance.instanceName);

    const cacheKey = `${instance.instanceName}:getInbox`;
    if (await this.cache.has(cacheKey)) {
      return (await this.cache.get(cacheKey)) as inbox;
    }

    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    this.logger.verbose('find inboxes in chatwoot');
    const inbox = (await client.inboxes.list({
      accountId: this.provider.account_id,
    })) as any;

    if (!inbox) {
      this.logger.warn('inbox not found');
      return null;
    }

    this.logger.verbose('find inbox by name');
    let findByName = inbox.payload.find((inbox) => inbox.name === this.getClientCwConfig().name_inbox);

    if (!findByName) {
      findByName = inbox.payload.find((inbox) => inbox.name === this.getClientCwConfig().name_inbox.split('-cwId-')[0]);
    }


    if (!findByName) {
      this.logger.warn('inbox not found');
      return null;
    }

    this.logger.verbose('return inbox');
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
  ) {
    this.logger.verbose('create message to instance: ' + instance.instanceName);

    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    const replyToIds = await this.getReplyToIds(messageBody, instance);

    this.logger.verbose('create message in chatwoot');
    const message = await client.messages.create({
      accountId: this.provider.account_id,
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
      },
    });

    if (!message) {
      this.logger.warn('message not found');
      return null;
    }

    this.logger.verbose('message created');

    return message;
  }

  public async getOpenConversationByContact(
    instance: InstanceDto,
    inbox: inbox,
    contact: generic_id & contact,
  ): Promise<conversation> {
    this.logger.verbose('find conversation in chatwoot');

    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    const conversations = (await client.contacts.listConversations({
      accountId: this.provider.account_id,
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
    this.logger.verbose('create bot message to instance: ' + instance.instanceName);

    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    this.logger.verbose('find contact in chatwoot');
    const contact = await this.findContact(instance, '123456');

    if (!contact) {
      this.logger.warn('contact not found');
      return null;
    }

    this.logger.verbose('get inbox to instance: ' + instance.instanceName);
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

    this.logger.verbose('create message in chatwoot');
    const message = await client.messages.create({
      accountId: this.provider.account_id,
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

    this.logger.verbose('bot message created');

    return message;
  }

  private async sendData(
    conversationId: number,
    file: string,
    messageType: 'incoming' | 'outgoing' | undefined,
    content?: string,
    instance?: InstanceDto,
    messageBody?: any,
    sourceId?: string,
  ) {
    this.logger.verbose('send data to chatwoot');

    const data = new FormData();

    if (content) {
      this.logger.verbose('content found');
      data.append('content', content);
    }

    this.logger.verbose('message type: ' + messageType);
    data.append('message_type', messageType);

    this.logger.verbose('temp file found');
    data.append('attachments[]', createReadStream(file));

    if (messageBody && instance) {
      const replyToIds = await this.getReplyToIds(messageBody, instance);

      if (replyToIds.in_reply_to || replyToIds.in_reply_to_external_id) {
        data.append('content_attributes', {
          ...replyToIds,
        });
      }
    }

    if (sourceId) {
      data.append('source_id', sourceId);
    }

    this.logger.verbose('get client to instance: ' + this.provider.instanceName);
    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${this.provider.url}/api/v1/accounts/${this.provider.account_id}/conversations/${conversationId}/messages`,
      headers: {
        api_access_token: this.provider.token,
        ...data.getHeaders(),
      },
      data: data,
    };

    this.logger.verbose('send data to chatwoot');
    try {
      const { data } = await axios.request(config);

      this.logger.verbose('remove temp file');
      unlinkSync(file);

      this.logger.verbose('data sent');
      return data;
    } catch (error) {
      this.logger.error(error);
      unlinkSync(file);
    }
  }

  public async createBotQr(
    instance: InstanceDto,
    content: string,
    messageType: 'incoming' | 'outgoing' | undefined,
    file?: string,
  ) {
    this.logger.verbose('create bot qr to instance: ' + instance.instanceName);
    const client = await this.clientCw(instance);

    if (!client) {
      this.logger.warn('client not found');
      return null;
    }

    this.logger.verbose('find contact in chatwoot');
    const contact = await this.findContact(instance, '123456');

    if (!contact) {
      this.logger.warn('contact not found');
      return null;
    }

    this.logger.verbose('get inbox to instance: ' + instance.instanceName);
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

    this.logger.verbose('send data to chatwoot');
    const data = new FormData();

    if (content) {
      this.logger.verbose('content found');
      data.append('content', content);
    }

    this.logger.verbose('message type: ' + messageType);
    data.append('message_type', messageType);

    if (file) {
      this.logger.verbose('temp file found');
      data.append('attachments[]', createReadStream(file));
    }

    this.logger.verbose('get client to instance: ' + this.provider.instanceName);
    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${this.provider.url}/api/v1/accounts/${this.provider.account_id}/conversations/${conversation.id}/messages`,
      headers: {
        api_access_token: this.provider.token,
        ...data.getHeaders(),
      },
      data: data,
    };

    this.logger.verbose('send data to chatwoot');
    try {
      const { data } = await axios.request(config);

      this.logger.verbose('remove temp file');
      unlinkSync(file);

      this.logger.verbose('data sent');
      return data;
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async sendAttachment(waInstance: any, number: string, media: any, caption?: string, options?: Options) {
    this.logger.verbose('send attachment to instance: ' + waInstance.instanceName);

    try {
      this.logger.verbose('get media type');
      const parsedMedia = path.parse(decodeURIComponent(media));
      let mimeType = mimeTypes.lookup(parsedMedia?.ext) || '';
      let fileName = parsedMedia?.name + parsedMedia?.ext;

      if (!mimeType) {
        const parts = media.split('/');
        fileName = decodeURIComponent(parts[parts.length - 1]);
        this.logger.verbose('file name: ' + fileName);

        const response = await axios.get(media, {
          responseType: 'arraybuffer',
        });
        mimeType = response.headers['content-type'];
        this.logger.verbose('mime type: ' + mimeType);
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

      this.logger.verbose('type: ' + type);

      if (type === 'audio') {
        this.logger.verbose('send audio to instance: ' + waInstance.instanceName);
        const data: SendAudioDto = {
          number: number,
          audioMessage: {
            audio: media,
          },
          options: {
            delay: 1200,
            presence: 'recording',
            ...options,
          },
        };

        const messageSent = await waInstance?.audioWhatsapp(data, true);

        this.logger.verbose('audio sent');
        return messageSent;
      }

      if (type === 'image' && parsedMedia && parsedMedia?.ext === '.gif') {
        type = 'document';
      }

      this.logger.verbose('send media to instance: ' + waInstance.instanceName);
      const data: SendMediaDto = {
        number: number,
        mediaMessage: {
          mediatype: type as any,
          fileName: fileName,
          media: media,
        },
        options: {
          delay: 1200,
          presence: 'composing',
          ...options,
        },
      };

      if (caption) {
        this.logger.verbose('caption found');
        data.mediaMessage.caption = caption;
      }

      const messageSent = await waInstance?.mediaMessage(data, true);

      this.logger.verbose('media sent');
      return messageSent;
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async onSendMessageError(instance: InstanceDto, conversation: number, error?: string) {
    const client = await this.clientCw(instance);

    if (!client) {
      return;
    }

    client.messages.create({
      accountId: this.provider.account_id,
      conversationId: conversation,
      data: {
        content: i18next.t('cw.message.notsent', {
          error: error?.length > 0 ? `_${error}_` : '',
        }),
        message_type: 'outgoing',
        private: true,
      },
    });
  }

  public async receiveWebhook(instance: InstanceDto, body: any) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      this.logger.verbose('receive webhook to chatwoot instance: ' + instance.instanceName);
      const client = await this.clientCw(instance);

      if (!client) {
        this.logger.warn('client not found');
        return null;
      }

      // invalidate the conversation cache if reopen_conversation is false and the conversation was resolved
      if (
        this.provider.reopen_conversation === false &&
        body.event === 'conversation_status_changed' &&
        body.status === 'resolved' &&
        body.meta?.sender?.identifier
      ) {
        const keyToDelete = `${instance.instanceName}:createConversation-${body.meta.sender.identifier}`;
        this.cache.delete(keyToDelete);
      }

      this.logger.verbose('check if is bot');
      if (
        !body?.conversation ||
        body.private ||
        (body.event === 'message_updated' && !body.content_attributes?.deleted)
      ) {
        return { message: 'bot' };
      }

      this.logger.verbose('check if is group');
      const chatId =
        body.conversation.meta.sender?.phone_number?.replace('+', '') || body.conversation.meta.sender?.identifier;
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

      this.logger.verbose('check if is a message deletion');
      if (body.event === 'message_updated' && body.content_attributes?.deleted) {
        const message = await this.repository.message.find({
          where: {
            owner: instance.instanceName,
            chatwoot: {
              messageId: body.id,
            },
          },
          limit: 1,
        });
        if (message.length && message[0].key?.id) {
          this.logger.verbose('deleting message in whatsapp. Message id: ' + message[0].key.id);
          await waInstance?.client.sendMessage(message[0].key.remoteJid, { delete: message[0].key });

          this.logger.verbose('deleting message in repository. Message id: ' + message[0].key.id);
          this.repository.message.delete({
            where: {
              owner: instance.instanceName,
              chatwoot: {
                messageId: body.id,
              },
            },
          });
        }
        return { message: 'bot' };
      }

      if (chatId === '123456' && body.message_type === 'outgoing') {
        this.logger.verbose('check if is command');

        const command = messageReceived.replace('/', '');

        if (command.includes('init') || command.includes('iniciar')) {
          this.logger.verbose('command init found');
          const state = waInstance?.connectionStatus?.state;

          if (state !== 'open') {
            if (state === 'close') {
              this.logger.verbose('request cleaning up instance: ' + instance.instanceName);
            }
            this.logger.verbose('connect to whatsapp');
            const number = command.split(':')[1];
            await waInstance.connectToWhatsapp(number);
          } else {
            this.logger.verbose('whatsapp already connected');
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
          this.logger.verbose('command clearcache found');
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
          this.logger.verbose('command status found');

          const state = waInstance?.connectionStatus?.state;

          if (!state) {
            this.logger.verbose('state not found');
            await this.createBotMessage(
              instance,
              i18next.t('cw.inbox.notFound', {
                inboxName: body.inbox.name,
              }),
              'incoming',
            );
          }

          if (state) {
            this.logger.verbose('state: ' + state + ' found');
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

        if (command === 'disconnect' || command === 'desconectar') {
          this.logger.verbose('command disconnect found');

          const msgLogout = i18next.t('cw.inbox.disconnect', {
            inboxName: body.inbox.name,
          });

          this.logger.verbose('send message to chatwoot');
          await this.createBotMessage(instance, msgLogout, 'incoming');

          this.logger.verbose('disconnect to whatsapp');
          await waInstance?.client?.logout('Log out instance: ' + instance.instanceName);
          await waInstance?.client?.ws?.close();
        }
      }

      if (body.message_type === 'outgoing' && body?.conversation?.messages?.length && chatId !== '123456') {
        this.logger.verbose('check if is group');

        if (body?.conversation?.messages[0]?.source_id?.substring(0, 5) === 'WAID:') {
          this.logger.verbose('message sent directly from whatsapp. Webhook ignored.');
          return { message: 'bot' };
        }

        if (!waInstance && body.conversation?.id) {
          this.onSendMessageError(instance, body.conversation?.id, 'Instance not found');
          return { message: 'bot' };
        }

        this.logger.verbose('Format message to send');
        let formatText: string;
        if (senderName === null || senderName === undefined) {
          formatText = messageReceived;
        } else {
          const formattedDelimiter = this.provider.sign_delimiter
            ? this.provider.sign_delimiter.replaceAll('\\n', '\n')
            : '\n';
          const textToConcat = this.provider.sign_msg ? [`*${senderName}:*`] : [];
          textToConcat.push(messageReceived);

          formatText = textToConcat.join(formattedDelimiter);
        }

        for (const message of body.conversation.messages) {
          this.logger.verbose('check if message is media');
          if (message.attachments && message.attachments.length > 0) {
            this.logger.verbose('message is media');
            for (const attachment of message.attachments) {
              this.logger.verbose('send media to whatsapp');
              if (!messageReceived) {
                this.logger.verbose('message do not have text');
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
                this.onSendMessageError(instance, body.conversation?.id);
              }

              this.updateChatwootMessageId(
                {
                  ...messageSent,
                  owner: instance.instanceName,
                },
                {
                  messageId: body.id,
                  inboxId: body.inbox?.id,
                  conversationId: body.conversation?.id,
                  contactInbox: {
                    sourceId: body.conversation?.contact_inbox?.source_id,
                  },
                },
                instance,
              );
            }
          } else {
            this.logger.verbose('message is text');

            this.logger.verbose('send text to whatsapp');
            const data: SendTextDto = {
              number: chatId,
              textMessage: {
                text: formatText,
              },
              options: {
                delay: 1200,
                presence: 'composing',
                quoted: await this.getQuotedMessage(body, instance),
              },
            };

            let messageSent: MessageRaw | proto.WebMessageInfo;
            try {
              messageSent = await waInstance?.textMessage(data, true);
              if (!messageSent) {
                throw new Error('Message not sent');
              }

              this.updateChatwootMessageId(
                {
                  ...messageSent,
                  owner: instance.instanceName,
                },
                {
                  messageId: body.id,
                  inboxId: body.inbox?.id,
                  conversationId: body.conversation?.id,
                  contactInbox: {
                    sourceId: body.conversation?.contact_inbox?.source_id,
                  },
                },
                instance,
              );
            } catch (error) {
              if (!messageSent && body.conversation?.id) {
                this.onSendMessageError(instance, body.conversation?.id, error.toString());
              }
              throw error;
            }
          }
        }

        const chatwootRead = this.configService.get<Chatwoot>('CHATWOOT').MESSAGE_READ;
        if (chatwootRead) {
          const lastMessage = await this.repository.message.find({
            where: {
              key: {
                fromMe: false,
              },
              owner: instance.instanceName,
            },
            limit: 1,
          });
          if (lastMessage.length > 0 && !lastMessage[0].chatwoot?.isRead) {
            waInstance?.markMessageAsRead({
              read_messages: lastMessage.map((msg) => ({
                id: msg.key?.id,
                fromMe: msg.key?.fromMe,
                remoteJid: msg.key?.remoteJid,
              })),
            });
            const updateMessage = lastMessage.map((msg) => ({
              key: msg.key,
              owner: msg.owner,
              chatwoot: {
                ...msg.chatwoot,
                isRead: true,
              },
            }));
            this.repository.message.update(updateMessage, instance.instanceName, true);
          }
        }
      }

      if (body.message_type === 'template' && body.event === 'message_created') {
        this.logger.verbose('check if is template');

        const data: SendTextDto = {
          number: chatId,
          textMessage: {
            text: body.content.replace(/\\\r\n|\\\n|\n/g, '\n'),
          },
          options: {
            delay: 1200,
            presence: 'composing',
          },
        };

        this.logger.verbose('send text to whatsapp');

        await waInstance?.textMessage(data);
      }

      return { message: 'bot' };
    } catch (error) {
      this.logger.error(error);

      return { message: 'bot' };
    }
  }

  private updateChatwootMessageId(
    message: MessageRaw,
    chatwootMessageIds: MessageRaw['chatwoot'],
    instance: InstanceDto,
  ) {
    if (!chatwootMessageIds.messageId || !message?.key?.id) {
      return;
    }

    message.chatwoot = chatwootMessageIds;
    this.repository.message.update([message], instance.instanceName, true);
  }

  private async getMessageByKeyId(instance: InstanceDto, keyId: string): Promise<MessageRaw> {
    const messages = await this.repository.message.find({
      where: {
        key: {
          id: keyId,
        },
        owner: instance.instanceName,
      },
      limit: 1,
    });

    return messages.length ? messages[0] : null;
  }

  private async getReplyToIds(
    msg: any,
    instance: InstanceDto,
  ): Promise<{ in_reply_to: string; in_reply_to_external_id: string }> {
    let inReplyTo = null;
    let inReplyToExternalId = null;

    if (msg) {
      inReplyToExternalId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
      if (inReplyToExternalId) {
        const message = await this.getMessageByKeyId(instance, inReplyToExternalId);
        if (message?.chatwoot?.messageId) {
          inReplyTo = message.chatwoot.messageId;
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
      const message = await this.repository.message.find({
        where: {
          chatwoot: {
            messageId: msg?.content_attributes?.in_reply_to,
          },
          owner: instance.instanceName,
        },
        limit: 1,
      });
      if (message.length && message[0]?.key?.id) {
        return {
          key: message[0].key,
          message: message[0].message,
        };
      }
    }

    return null;
  }

  private isMediaMessage(message: any) {
    this.logger.verbose('check if is media message');
    const media = [
      'imageMessage',
      'documentMessage',
      'documentWithCaptionMessage',
      'audioMessage',
      'videoMessage',
      'stickerMessage',
    ];

    const messageKeys = Object.keys(message);

    const result = messageKeys.some((key) => media.includes(key));

    this.logger.verbose('is media message: ' + result);
    return result;
  }

  private getAdsMessage(msg: any) {
    interface AdsMessage {
      title: string;
      body: string;
      thumbnailUrl: string;
      sourceUrl: string;
    }
    const adsMessage: AdsMessage | undefined = msg.extendedTextMessage?.contextInfo?.externalAdReply;

    this.logger.verbose('Get ads message if it exist');
    adsMessage && this.logger.verbose('Ads message: ' + adsMessage);
    return adsMessage;
  }

  private getReactionMessage(msg: any) {
    interface ReactionMessage {
      key: MessageRaw['key'];
      text: string;
    }
    const reactionMessage: ReactionMessage | undefined = msg?.reactionMessage;

    this.logger.verbose('Get reaction message if it exists');
    reactionMessage && this.logger.verbose('Reaction message: ' + reactionMessage);
    return reactionMessage;
  }

  private getTypeMessage(msg: any) {
    this.logger.verbose('get type message');

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
    };

    this.logger.verbose('type message: ' + types);

    return types;
  }

  private getMessageContent(types: any) {
    this.logger.verbose('get message content');
    const typeKey = Object.keys(types).find((key) => types[key] !== undefined);

    const result = typeKey ? types[typeKey] : undefined;

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

      this.logger.verbose('message content: ' + formattedLocation);

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

      this.logger.verbose('message content: ' + formattedContact);
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

      this.logger.verbose('formatted contacts: ' + formattedContactsArray);

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

    this.logger.verbose('message content: ' + result);

    return result;
  }

  public getConversationMessage(msg: any) {
    this.logger.verbose('get conversation message');

    const types = this.getTypeMessage(msg);

    const messageContent = this.getMessageContent(types);

    this.logger.verbose('conversation message: ' + messageContent);

    return messageContent;
  }

  public async eventWhatsapp(event: string, instance: InstanceDto, body: any) {
    this.logger.verbose('event whatsapp to instance: ' + instance.instanceName);
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

      if (event === 'contact.is_not_in_wpp') {
        const getConversation = await this.createConversation(instance, body);

        if (!getConversation) {
          this.logger.warn('conversation not found');
          return;
        }

        client.messages.create({
          accountId: this.provider.account_id,
          conversationId: getConversation,
          data: {
            content: `🚨 ${i18next.t('numbernotinwhatsapp')}`,
            message_type: 'outgoing',
            private: true,
          },
        });

        return;
      }

      if (event === 'messages.upsert' || event === 'send.message') {
        this.logger.verbose('event messages.upsert');

        if (body.key.remoteJid === 'status@broadcast') {
          this.logger.verbose('status broadcast found');
          return;
        }

        // fix when receiving/sending messages from whatsapp desktop with ephemeral messages enabled
        if (body.message?.ephemeralMessage?.message) {
          body.message = {
            ...body.message?.ephemeralMessage?.message,
          };
        }

        this.logger.verbose('get conversation message');

        // Whatsapp to Chatwoot
        const originalMessage = await this.getConversationMessage(body.message);
        const bodyMessage = originalMessage
          ? originalMessage
              .replaceAll(/\*((?!\s)([^\n*]+?)(?<!\s))\*/g, '**$1**')
              .replaceAll(/_((?!\s)([^\n_]+?)(?<!\s))_/g, '*$1*')
              .replaceAll(/~((?!\s)([^\n~]+?)(?<!\s))~/g, '~~$1~~')
          : originalMessage;

        this.logger.verbose('body message: ' + bodyMessage);

        if (bodyMessage && bodyMessage.includes('Por favor, classifique esta conversa, http')) {
          this.logger.verbose('conversation is closed');
          return;
        }

        const isMedia = this.isMediaMessage(body.message);

        const adsMessage = this.getAdsMessage(body.message);

        const reactionMessage = this.getReactionMessage(body.message);

        if (!bodyMessage && !isMedia && !reactionMessage) {
          this.logger.warn('no body message found');
          return;
        }

        this.logger.verbose('get conversation in chatwoot');
        const getConversation = await this.createConversation(instance, body);

        if (!getConversation) {
          this.logger.warn('conversation not found');
          return;
        }

        const messageType = body.key.fromMe ? 'outgoing' : 'incoming';

        this.logger.verbose('message type: ' + messageType);

        this.logger.verbose('is media: ' + isMedia);

        this.logger.verbose('check if is media');
        if (isMedia) {
          this.logger.verbose('message is media');

          this.logger.verbose('get base64 from media message');
          const downloadBase64 = await waInstance?.getBase64FromMediaMessage({
            message: {
              ...body,
            },
          });

          let nameFile: string;
          const messageBody = body?.message[body?.messageType];
          const originalFilename = messageBody?.fileName || messageBody?.message?.documentMessage?.fileName;
          if (originalFilename) {
            const parsedFile = path.parse(originalFilename);
            if (parsedFile.name && parsedFile.ext) {
              nameFile = `${parsedFile.name}-${Math.floor(Math.random() * (99 - 10 + 1) + 10)}${parsedFile.ext}`;
            }
          }

          if (!nameFile) {
            nameFile = `${Math.random().toString(36).substring(7)}.${
              mimeTypes.extension(downloadBase64.mimetype) || ''
            }`;
          }

          const fileData = Buffer.from(downloadBase64.base64, 'base64');

          const fileName = `${path.join(waInstance?.storePath, 'temp', `${nameFile}`)}`;

          this.logger.verbose('temp file name: ' + nameFile);

          this.logger.verbose('create temp file');
          writeFileSync(fileName, fileData, 'utf8');

          this.logger.verbose('check if is group');
          if (body.key.remoteJid.includes('@g.us')) {
            this.logger.verbose('message is group');

            const participantName = body.pushName;

            let content: string;

            if (!body.key.fromMe) {
              this.logger.verbose('message is not from me');
              content = `**${participantName}:**\n\n${bodyMessage}`;
            } else {
              this.logger.verbose('message is from me');
              content = `${bodyMessage}`;
            }

            this.logger.verbose('send data to chatwoot');
            const send = await this.sendData(
              getConversation,
              fileName,
              messageType,
              content,
              instance,
              body,
              'WAID:' + body.key.id,
            );

            if (!send) {
              this.logger.warn('message not sent');
              return;
            }

            return send;
          } else {
            this.logger.verbose('message is not group');

            this.logger.verbose('send data to chatwoot');
            const send = await this.sendData(
              getConversation,
              fileName,
              messageType,
              bodyMessage,
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
        }

        this.logger.verbose('check if has ReactionMessage');
        if (reactionMessage) {
          this.logger.verbose('send data to chatwoot');
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
            );
            if (!send) {
              this.logger.warn('message not sent');
              return;
            }
          }

          return;
        }

        this.logger.verbose('check if has Ads Message');
        if (adsMessage) {
          this.logger.verbose('message is from Ads');

          this.logger.verbose('get base64 from media ads message');
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
          const fileName = `${path.join(waInstance?.storePath, 'temp', `${nameFile}`)}`;

          this.logger.verbose('temp file name: ' + nameFile);
          this.logger.verbose('create temp file');
          await Jimp.read(fileData)
            .then(async (img) => {
              await img.cover(320, 180).writeAsync(fileName);
            })
            .catch((err) => {
              this.logger.error(`image is not write: ${err}`);
            });
          const truncStr = (str: string, len: number) => {
            return str.length > len ? str.substring(0, len) + '...' : str;
          };

          const title = truncStr(adsMessage.title, 40);
          const description = truncStr(adsMessage.body, 75);

          this.logger.verbose('send data to chatwoot');
          const send = await this.sendData(
            getConversation,
            fileName,
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

        this.logger.verbose('check if is group');
        if (body.key.remoteJid.includes('@g.us')) {
          this.logger.verbose('message is group');
          const participantName = body.pushName;

          let content: string;

          if (!body.key.fromMe) {
            this.logger.verbose('message is not from me');
            content = `**${participantName}**\n\n${bodyMessage}`;
          } else {
            this.logger.verbose('message is from me');
            content = `${bodyMessage}`;
          }

          this.logger.verbose('send data to chatwoot');
          const send = await this.createMessage(
            instance,
            getConversation,
            content,
            messageType,
            false,
            [],
            body,
            'WAID:' + body.key.id,
          );

          if (!send) {
            this.logger.warn('message not sent');
            return;
          }

          return send;
        } else {
          this.logger.verbose('message is not group');

          this.logger.verbose('send data to chatwoot');
          const send = await this.createMessage(
            instance,
            getConversation,
            bodyMessage,
            messageType,
            false,
            [],
            body,
            'WAID:' + body.key.id,
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
          this.logger.verbose('deleting message from instance: ' + instance.instanceName);

          if (!body?.key?.id) {
            this.logger.warn('message id not found');
            return;
          }

          const message = await this.getMessageByKeyId(instance, body.key.id);
          if (message?.chatwoot?.messageId && message?.chatwoot?.conversationId) {
            this.logger.verbose('deleting message in repository. Message id: ' + body.key.id);
            this.repository.message.delete({
              where: {
                key: {
                  id: body.key.id,
                },
                owner: instance.instanceName,
              },
            });

            this.logger.verbose('deleting message in chatwoot. Message id: ' + body.key.id);
            return await client.messages.delete({
              accountId: this.provider.account_id,
              conversationId: message.chatwoot.conversationId,
              messageId: message.chatwoot.messageId,
            });
          }
        }
      }

      if (event === 'messages.edit') {
        const editedText = `${
          body?.editedMessage?.conversation || body?.editedMessage?.extendedTextMessage?.text
        }\n\n_\`${i18next.t('cw.message.edited')}.\`_`;
        const message = await this.getMessageByKeyId(instance, body?.key?.id);
        const messageType = message.key?.fromMe ? 'outgoing' : 'incoming';

        if (message && message.chatwoot?.conversationId) {
          const send = await this.createMessage(
            instance,
            message.chatwoot.conversationId,
            editedText,
            messageType,
            false,
            [],
            {
              message: { extendedTextMessage: { contextInfo: { stanzaId: message.key.id } } },
            },
            'WAID:' + body.key.id,
          );
          if (!send) {
            this.logger.warn('edited message not sent');
            return;
          }
        }
        return;
      }

      if (event === 'messages.read') {
        this.logger.verbose('read message from instance: ' + instance.instanceName);

        if (!body?.key?.id || !body?.key?.remoteJid) {
          this.logger.warn('message id not found');
          return;
        }

        const message = await this.getMessageByKeyId(instance, body.key.id);
        const { conversationId, contactInbox } = message?.chatwoot || {};
        if (conversationId) {
          let sourceId = contactInbox?.sourceId;
          const inbox = (await this.getInbox(instance)) as inbox & {
            inbox_identifier?: string;
          };

          if (!sourceId && inbox) {
            const conversation = (await client.conversations.get({
              accountId: this.provider.account_id,
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
        this.logger.verbose('event status.instance');
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

        this.logger.verbose('send message to chatwoot');
        await this.createBotMessage(instance, msgStatus, 'incoming');
      }

      if (event === 'connection.update') {
        this.logger.verbose('event connection.update');

        if (body.status === 'open') {
          // if we have qrcode count then we understand that a new connection was established
          if (this.waMonitor.waInstances[instance.instanceName].qrCode.count > 0) {
            const msgConnection = i18next.t('cw.inbox.connected');
            this.logger.verbose('send message to chatwoot');
            await this.createBotMessage(instance, msgConnection, 'incoming');
            this.waMonitor.waInstances[instance.instanceName].qrCode.count = 0;
            chatwootImport.clearAll(instance);
          }
        }
      }

      if (event === 'qrcode.updated') {
        this.logger.verbose('event qrcode.updated');
        if (body.statusCode === 500) {
          this.logger.verbose('qrcode error');

          const erroQRcode = `🚨 ${i18next.t('qrlimitreached')}`;

          this.logger.verbose('send message to chatwoot');
          return await this.createBotMessage(instance, erroQRcode, 'incoming');
        } else {
          this.logger.verbose('qrcode success');
          const fileData = Buffer.from(body?.qrcode.base64.replace('data:image/png;base64,', ''), 'base64');

          const fileName = `${path.join(waInstance?.storePath, 'temp', `${instance.instanceName}.png`)}`;

          this.logger.verbose('temp file name: ' + fileName);

          this.logger.verbose('create temp file');
          writeFileSync(fileName, fileData, 'utf8');

          this.logger.verbose('send qrcode to chatwoot');
          await this.createBotQr(instance, i18next.t('qrgeneratedsuccesfully'), 'incoming', fileName);

          let msgQrCode = `⚡️${i18next.t('qrgeneratedsuccesfully')}\n\n${i18next.t('scanqr')}`;

          if (body?.qrcode?.pairingCode) {
            msgQrCode =
              msgQrCode +
              `\n\n*Pairing Code:* ${body.qrcode.pairingCode.substring(0, 4)}-${body.qrcode.pairingCode.substring(
                4,
                8,
              )}`;
          }

          this.logger.verbose('send message to chatwoot');
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

  /* We can't proccess messages exactly in batch because Chatwoot use message id to order
     messages in frontend and we are receiving the messages mixed between the batches.
     Because this, we need to put all batches together and order after */
  public addHistoryMessages(instance: InstanceDto, messagesRaw: MessageRaw[]) {
    if (!this.isImportHistoryAvailable()) {
      return;
    }

    chatwootImport.addHistoryMessages(instance, messagesRaw);
  }

  public addHistoryContacts(instance: InstanceDto, contactsRaw: ContactRaw[]) {
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

      const contactsWithProfilePicture = (
        await this.repository.contact.find({
          where: {
            owner: instance.instanceName,
            id: {
              $in: recentContacts.map((contact) => contact.identifier),
            },
            profilePictureUrl: { $ne: null },
          },
        } as any)
      ).reduce((acc: Map<string, ContactRaw>, contact: ContactRaw) => acc.set(contact.id, contact), new Map());

      recentContacts.forEach(async (contact) => {
        if (contactsWithProfilePicture.has(contact.identifier)) {
          client.contacts.update({
            accountId: this.provider.account_id,
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
}
