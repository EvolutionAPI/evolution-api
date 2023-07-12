import { InstanceDto } from '../dto/instance.dto';
import { ChatwootDto } from '../dto/chatwoot.dto';
import { WAMonitoringService } from './monitor.service';
import { Logger } from '../../config/logger.config';
import ChatwootClient from '@figuro/chatwoot-sdk';
import { createReadStream, unlinkSync } from 'fs';
import axios from 'axios';
import FormData from 'form-data';

export class ChatwootService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(ChatwootService.name);

  private provider: any;

  private async getProvider(instance: InstanceDto) {
    const provider = await this.waMonitor.waInstances[
      instance.instanceName
    ].findChatwoot();

    return provider;
  }

  private async clientCw(instance: InstanceDto) {
    const provider = await this.getProvider(instance);

    if (!provider) {
      throw new Error('provider not found');
    }

    this.provider = provider;

    const client = new ChatwootClient({
      config: {
        basePath: provider.url,
        with_credentials: true,
        credentials: 'include',
        token: provider.token,
      },
    });

    return client;
  }

  public create(instance: InstanceDto, data: ChatwootDto) {
    this.logger.verbose('create chatwoot: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setChatwoot(data);

    return { chatwoot: { ...instance, chatwoot: data } };
  }

  public async find(instance: InstanceDto): Promise<ChatwootDto> {
    try {
      this.logger.verbose('find chatwoot: ' + instance.instanceName);
      return await this.waMonitor.waInstances[instance.instanceName].findChatwoot();
    } catch (error) {
      return { enabled: null, url: '' };
    }
  }

  public async getContact(instance: InstanceDto, id: number) {
    const client = await this.clientCw(instance);

    if (!client) {
      throw new Error('client not found');
    }

    if (!id) {
      throw new Error('id is required');
    }

    const contact = await client.contact.getContactable({
      accountId: this.provider.accountId,
      id,
    });

    return contact;
  }

  public async createContact(
    instance: InstanceDto,
    phoneNumber: string,
    inboxId: number,
    accountId: number,
    name?: string,
  ) {
    const client = await this.clientCw(instance);

    if (!client) {
      throw new Error('client not found');
    }

    const contact = await client.contacts.create({
      accountId: this.provider.accountId,
      data: {
        inbox_id: inboxId,
        name: name || phoneNumber,
        phone_number: `+${phoneNumber}`,
      },
    });

    return contact;
  }

  public async updateContact(instance: InstanceDto, id: number, data: any) {
    const client = await this.clientCw(instance);

    if (!client) {
      throw new Error('client not found');
    }

    if (!id) {
      throw new Error('id is required');
    }

    const contact = await client.contacts.update({
      accountId: this.provider.accountId,
      id,
      data,
    });

    return contact;
  }

  public async findContact(instance: InstanceDto, phoneNumber: string) {
    const client = await this.clientCw(instance);

    if (!client) {
      throw new Error('client not found');
    }

    const contact = await client.contacts.search({
      accountId: this.provider.accountId,
      q: `+${phoneNumber}`,
    });

    return contact.payload.find((contact) => contact.phone_number === `+${phoneNumber}`);
  }

  public async createConversation(instance: InstanceDto, body: any) {
    const client = await this.clientCw(instance);

    if (!client) {
      throw new Error('client not found');
    }

    const chatId = body.data.key.remoteJid.split('@')[0];
    const nameContact = !body.data.key.fromMe ? body.data.pushName : chatId;

    const filterInbox = await this.getInbox(instance);

    const contact =
      (await this.findContact(instance, chatId)) ||
      ((await this.createContact(instance, chatId, filterInbox.id, nameContact)) as any);

    const contactId = contact.id || contact.payload.contact.id;

    if (!body.data.key.fromMe && contact.name === chatId && nameContact !== chatId) {
      await this.updateContact(instance, contactId, {
        name: nameContact,
      });
    }

    const contactConversations = (await client.contacts.listConversations({
      accountId: this.provider.accountId,
      id: contactId,
    })) as any;

    if (contactConversations) {
      const conversation = contactConversations.payload.find(
        (conversation) =>
          conversation.status !== 'resolved' && conversation.inbox_id == filterInbox.id,
      );
      if (conversation) {
        return conversation.id;
      }
    }

    const conversation = await client.conversations.create({
      accountId: this.provider.accountId,
      data: {
        contact_id: `${contactId}`,
        inbox_id: `${filterInbox.id}`,
      },
    });

    return conversation.id;
  }

  public async getInbox(instance: InstanceDto) {
    const client = await this.clientCw(instance);

    if (!client) {
      throw new Error('client not found');
    }

    const inbox = (await client.inboxes.list({
      accountId: this.provider.accountId,
    })) as any;
    const findByName = inbox.payload.find((inbox) => inbox.name === instance);
    return findByName;
  }

  public async createMessage(
    instance: InstanceDto,
    conversationId: number,
    content: string,
    messageType: 'incoming' | 'outgoing' | undefined,
    attachments?: {
      content: unknown;
      encoding: string;
      filename: string;
    }[],
  ) {
    const client = await this.clientCw(instance);

    const message = await client.messages.create({
      accountId: this.provider.accountId,
      conversationId: conversationId,
      data: {
        content: content,
        message_type: messageType,
        attachments: attachments,
      },
    });

    return message;
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

    const contact = await this.findContact(instance, '123456');

    const filterInbox = await this.getInbox(instance);

    const findConversation = await client.conversations.list({
      accountId: this.provider.accountId,
      inboxId: filterInbox.id,
    });
    const conversation = findConversation.data.payload.find(
      (conversation) =>
        conversation?.meta?.sender?.id === contact.id && conversation.status === 'open',
    );

    const message = await client.messages.create({
      accountId: this.provider.accountId,
      conversationId: conversation.id,
      data: {
        content: content,
        message_type: messageType,
        attachments: attachments,
      },
    });

    return message;
  }

  private async sendData(
    conversationId: number,
    file: string,
    messageType: 'incoming' | 'outgoing' | undefined,
    content?: string,
  ) {
    const data = new FormData();

    if (content) {
      data.append('content', content);
    }

    data.append('message_type', messageType);

    data.append('attachments[]', createReadStream(file));

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
      unlinkSync(file);
      return data;
    } catch (error) {
      console.log(error);
    }
  }

  public async createBotQr(
    instance: InstanceDto,
    content: string,
    messageType: 'incoming' | 'outgoing' | undefined,
    file?: string,
  ) {
    const client = await this.clientCw(instance);

    const contact = await this.findContact(instance, '123456');

    const filterInbox = await this.getInbox(instance);

    const findConversation = await client.conversations.list({
      accountId: this.provider.accountId,
      inboxId: filterInbox.id,
    });
    const conversation = findConversation.data.payload.find(
      (conversation) =>
        conversation?.meta?.sender?.id === contact.id && conversation.status === 'open',
    );

    const data = new FormData();

    if (content) {
      data.append('content', content);
    }

    data.append('message_type', messageType);

    if (file) {
      data.append('attachments[]', createReadStream(file));
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
      unlinkSync(file);
      return data;
    } catch (error) {
      console.log(error);
    }
  }

  public async chatwootWebhook(instance: InstanceDto, body: any) {
    return true;
  }
}
