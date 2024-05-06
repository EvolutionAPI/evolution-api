import { inbox } from '@figuro/chatwoot-sdk';
import { proto } from 'baileys';

import { InstanceDto } from '../../../../api/dto/instance.dto';
import { ChatwootRaw, ContactRaw, MessageRaw } from '../../../../api/models';
import { Chatwoot, configService } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { postgresClient } from '../libs/postgres.client';
import { ChatwootService } from '../services/chatwoot.service';

type ChatwootUser = {
  user_type: string;
  user_id: number;
};

type FksChatwoot = {
  phone_number: string;
  contact_id: string;
  conversation_id: string;
};

type firstLastTimestamp = {
  first: number;
  last: number;
};

type IWebMessageInfo = Omit<proto.IWebMessageInfo, 'key'> & Partial<Pick<proto.IWebMessageInfo, 'key'>>;

class ChatwootImport {
  private logger = new Logger(ChatwootImport.name);
  private repositoryMessagesCache = new Map<string, Set<string>>();
  private historyMessages = new Map<string, MessageRaw[]>();
  private historyContacts = new Map<string, ContactRaw[]>();

  public getRepositoryMessagesCache(instance: InstanceDto) {
    return this.repositoryMessagesCache.has(instance.instanceName)
      ? this.repositoryMessagesCache.get(instance.instanceName)
      : null;
  }

  public setRepositoryMessagesCache(instance: InstanceDto, repositoryMessagesCache: Set<string>) {
    this.repositoryMessagesCache.set(instance.instanceName, repositoryMessagesCache);
  }

  public deleteRepositoryMessagesCache(instance: InstanceDto) {
    this.repositoryMessagesCache.delete(instance.instanceName);
  }

  public addHistoryMessages(instance: InstanceDto, messagesRaw: MessageRaw[]) {
    const actualValue = this.historyMessages.has(instance.instanceName)
      ? this.historyMessages.get(instance.instanceName)
      : [];
    this.historyMessages.set(instance.instanceName, actualValue.concat(messagesRaw));
  }

  public addHistoryContacts(instance: InstanceDto, contactsRaw: ContactRaw[]) {
    const actualValue = this.historyContacts.has(instance.instanceName)
      ? this.historyContacts.get(instance.instanceName)
      : [];
    this.historyContacts.set(instance.instanceName, actualValue.concat(contactsRaw));
  }

  public deleteHistoryMessages(instance: InstanceDto) {
    this.historyMessages.delete(instance.instanceName);
  }

  public deleteHistoryContacts(instance: InstanceDto) {
    this.historyContacts.delete(instance.instanceName);
  }

  public clearAll(instance: InstanceDto) {
    this.deleteRepositoryMessagesCache(instance);
    this.deleteHistoryMessages(instance);
    this.deleteHistoryContacts(instance);
  }

  public getHistoryMessagesLenght(instance: InstanceDto) {
    return this.historyMessages.get(instance.instanceName)?.length ?? 0;
  }

  public async importHistoryContacts(instance: InstanceDto, provider: ChatwootRaw) {
    try {
      if (this.getHistoryMessagesLenght(instance) > 0) {
        return;
      }

      const pgClient = postgresClient.getChatwootConnection();

      let totalContactsImported = 0;

      const contacts = this.historyContacts.get(instance.instanceName) || [];
      if (contacts.length === 0) {
        return 0;
      }

      let contactsChunk: ContactRaw[] = this.sliceIntoChunks(contacts, 3000);
      while (contactsChunk.length > 0) {
        // inserting contacts in chatwoot db
        let sqlInsert = `INSERT INTO contacts
          (name, phone_number, account_id, identifier, created_at, updated_at) VALUES `;
        const bindInsert = [provider.account_id];

        for (const contact of contactsChunk) {
          bindInsert.push(contact.pushName);
          const bindName = `$${bindInsert.length}`;

          bindInsert.push(`+${contact.id.split('@')[0]}`);
          const bindPhoneNumber = `$${bindInsert.length}`;

          bindInsert.push(contact.id);
          const bindIdentifier = `$${bindInsert.length}`;

          sqlInsert += `(${bindName}, ${bindPhoneNumber}, $1, ${bindIdentifier}, NOW(), NOW()),`;
        }
        if (sqlInsert.slice(-1) === ',') {
          sqlInsert = sqlInsert.slice(0, -1);
        }
        sqlInsert += ` ON CONFLICT (identifier, account_id)
                       DO UPDATE SET
                        name = EXCLUDED.name,
                        phone_number = EXCLUDED.phone_number,
                        identifier = EXCLUDED.identifier`;

        totalContactsImported += (await pgClient.query(sqlInsert, bindInsert))?.rowCount ?? 0;
        contactsChunk = this.sliceIntoChunks(contacts, 3000);
      }

      this.deleteHistoryContacts(instance);

      return totalContactsImported;
    } catch (error) {
      this.logger.error(`Error on import history contacts: ${error.toString()}`);
    }
  }

  public async importHistoryMessages(
    instance: InstanceDto,
    chatwootService: ChatwootService,
    inbox: inbox,
    provider: ChatwootRaw,
  ) {
    try {
      const pgClient = postgresClient.getChatwootConnection();

      const chatwootUser = await this.getChatwootUser(provider);
      if (!chatwootUser) {
        throw new Error('User not found to import messages.');
      }

      let totalMessagesImported = 0;

      const messagesOrdered = this.historyMessages.get(instance.instanceName) || [];
      if (messagesOrdered.length === 0) {
        return 0;
      }

      // ordering messages by number and timestamp asc
      messagesOrdered.sort((a, b) => {
        return (
          parseInt(a.key.remoteJid) - parseInt(b.key.remoteJid) ||
          (a.messageTimestamp as number) - (b.messageTimestamp as number)
        );
      });

      const allMessagesMappedByPhoneNumber = this.createMessagesMapByPhoneNumber(messagesOrdered);
      // Map structure: +552199999999 => { first message timestamp from number, last message timestamp from number}
      const phoneNumbersWithTimestamp = new Map<string, firstLastTimestamp>();
      allMessagesMappedByPhoneNumber.forEach((messages: MessageRaw[], phoneNumber: string) => {
        phoneNumbersWithTimestamp.set(phoneNumber, {
          first: messages[0]?.messageTimestamp as number,
          last: messages[messages.length - 1]?.messageTimestamp as number,
        });
      });

      // processing messages in batch
      const batchSize = 4000;
      let messagesChunk: MessageRaw[] = this.sliceIntoChunks(messagesOrdered, batchSize);
      while (messagesChunk.length > 0) {
        // Map structure: +552199999999 => MessageRaw[]
        const messagesByPhoneNumber = this.createMessagesMapByPhoneNumber(messagesChunk);

        if (messagesByPhoneNumber.size > 0) {
          const fksByNumber = await this.selectOrCreateFksFromChatwoot(
            provider,
            inbox,
            phoneNumbersWithTimestamp,
            messagesByPhoneNumber,
          );

          // inserting messages in chatwoot db
          let sqlInsertMsg = `INSERT INTO messages
            (content, account_id, inbox_id, conversation_id, message_type, private, content_type,
            sender_type, sender_id, created_at, updated_at) VALUES `;
          const bindInsertMsg = [provider.account_id, inbox.id];

          messagesByPhoneNumber.forEach((messages: MessageRaw[], phoneNumber: string) => {
            const fksChatwoot = fksByNumber.get(phoneNumber);

            messages.forEach((message) => {
              if (!message.message) {
                return;
              }

              if (!fksChatwoot?.conversation_id || !fksChatwoot?.contact_id) {
                return;
              }

              const contentMessage = this.getContentMessage(chatwootService, message);
              if (!contentMessage) {
                return;
              }

              bindInsertMsg.push(contentMessage);
              const bindContent = `$${bindInsertMsg.length}`;

              bindInsertMsg.push(fksChatwoot.conversation_id);
              const bindConversationId = `$${bindInsertMsg.length}`;

              bindInsertMsg.push(message.key.fromMe ? '1' : '0');
              const bindMessageType = `$${bindInsertMsg.length}`;

              bindInsertMsg.push(message.key.fromMe ? chatwootUser.user_type : 'Contact');
              const bindSenderType = `$${bindInsertMsg.length}`;

              bindInsertMsg.push(message.key.fromMe ? chatwootUser.user_id : fksChatwoot.contact_id);
              const bindSenderId = `$${bindInsertMsg.length}`;

              bindInsertMsg.push(message.messageTimestamp as number);
              const bindmessageTimestamp = `$${bindInsertMsg.length}`;

              sqlInsertMsg += `(${bindContent}, $1, $2, ${bindConversationId}, ${bindMessageType}, FALSE, 0,
                  ${bindSenderType},${bindSenderId}, to_timestamp(${bindmessageTimestamp}), to_timestamp(${bindmessageTimestamp})),`;
            });
          });
          if (bindInsertMsg.length > 2) {
            if (sqlInsertMsg.slice(-1) === ',') {
              sqlInsertMsg = sqlInsertMsg.slice(0, -1);
            }
            totalMessagesImported += (await pgClient.query(sqlInsertMsg, bindInsertMsg))?.rowCount ?? 0;
          }
        }
        messagesChunk = this.sliceIntoChunks(messagesOrdered, batchSize);
      }

      this.deleteHistoryMessages(instance);
      this.deleteRepositoryMessagesCache(instance);

      this.importHistoryContacts(instance, provider);

      return totalMessagesImported;
    } catch (error) {
      this.logger.error(`Error on import history messages: ${error.toString()}`);

      this.deleteHistoryMessages(instance);
      this.deleteRepositoryMessagesCache(instance);
    }
  }

  public async selectOrCreateFksFromChatwoot(
    provider: ChatwootRaw,
    inbox: inbox,
    phoneNumbersWithTimestamp: Map<string, firstLastTimestamp>,
    messagesByPhoneNumber: Map<string, MessageRaw[]>,
  ): Promise<Map<string, FksChatwoot>> {
    const pgClient = postgresClient.getChatwootConnection();

    const bindValues = [provider.account_id, inbox.id];
    const phoneNumberBind = Array.from(messagesByPhoneNumber.keys())
      .map((phoneNumber) => {
        const phoneNumberTimestamp = phoneNumbersWithTimestamp.get(phoneNumber);

        if (phoneNumberTimestamp) {
          bindValues.push(phoneNumber);
          let bindStr = `($${bindValues.length},`;

          bindValues.push(phoneNumberTimestamp.first);
          bindStr += `$${bindValues.length},`;

          bindValues.push(phoneNumberTimestamp.last);
          return `${bindStr}$${bindValues.length})`;
        }
      })
      .join(',');

    // select (or insert when necessary) data from tables contacts, contact_inboxes, conversations from chatwoot db
    const sqlFromChatwoot = `WITH
              phone_number AS (
                SELECT phone_number, created_at::INTEGER, last_activity_at::INTEGER FROM (
                  VALUES 
                   ${phoneNumberBind}
                 ) as t (phone_number, created_at, last_activity_at)
              ),

              only_new_phone_number AS (
                SELECT * FROM phone_number
                WHERE phone_number NOT IN (
                  SELECT phone_number
                  FROM contacts
                    JOIN contact_inboxes ci ON ci.contact_id = contacts.id AND ci.inbox_id = $2
                    JOIN conversations con ON con.contact_inbox_id = ci.id 
                      AND con.account_id = $1
                      AND con.inbox_id = $2
                      AND con.contact_id = contacts.id
                  WHERE contacts.account_id = $1
                )
              ),

              new_contact AS (
                INSERT INTO contacts (name, phone_number, account_id, identifier, created_at, updated_at)
                SELECT REPLACE(p.phone_number, '+', ''), p.phone_number, $1, CONCAT(REPLACE(p.phone_number, '+', ''),
                  '@s.whatsapp.net'), to_timestamp(p.created_at), to_timestamp(p.last_activity_at)
                FROM only_new_phone_number AS p
                ON CONFLICT(identifier, account_id) DO UPDATE SET updated_at = EXCLUDED.updated_at
                RETURNING id, phone_number, created_at, updated_at
              ),

              new_contact_inbox AS (
                INSERT INTO contact_inboxes (contact_id, inbox_id, source_id, created_at, updated_at)
                SELECT new_contact.id, $2, gen_random_uuid(), new_contact.created_at, new_contact.updated_at
                FROM new_contact 
                RETURNING id, contact_id, created_at, updated_at
              ),

              new_conversation AS (
                INSERT INTO conversations (account_id, inbox_id, status, contact_id,
                  contact_inbox_id, uuid, last_activity_at, created_at, updated_at)
                SELECT $1, $2, 0, new_contact_inbox.contact_id, new_contact_inbox.id, gen_random_uuid(),
                  new_contact_inbox.updated_at, new_contact_inbox.created_at, new_contact_inbox.updated_at
                FROM new_contact_inbox
                RETURNING id, contact_id
              )

              SELECT new_contact.phone_number, new_conversation.contact_id, new_conversation.id AS conversation_id
              FROM new_conversation 
              JOIN new_contact ON new_conversation.contact_id = new_contact.id

              UNION

              SELECT p.phone_number, c.id contact_id, con.id conversation_id
                FROM phone_number p
              JOIN contacts c ON c.phone_number = p.phone_number
              JOIN contact_inboxes ci ON ci.contact_id = c.id AND ci.inbox_id = $2
              JOIN conversations con ON con.contact_inbox_id = ci.id AND con.account_id = $1
                AND con.inbox_id = $2 AND con.contact_id = c.id`;

    const fksFromChatwoot = await pgClient.query(sqlFromChatwoot, bindValues);

    return new Map(fksFromChatwoot.rows.map((item: FksChatwoot) => [item.phone_number, item]));
  }

  public async getChatwootUser(provider: ChatwootRaw): Promise<ChatwootUser> {
    try {
      const pgClient = postgresClient.getChatwootConnection();

      const sqlUser = `SELECT owner_type AS user_type, owner_id AS user_id
                         FROM access_tokens
                       WHERE token = $1`;

      return (await pgClient.query(sqlUser, [provider.token]))?.rows[0] || false;
    } catch (error) {
      this.logger.error(`Error on getChatwootUser: ${error.toString()}`);
    }
  }

  public createMessagesMapByPhoneNumber(messages: MessageRaw[]): Map<string, MessageRaw[]> {
    return messages.reduce((acc: Map<string, MessageRaw[]>, message: MessageRaw) => {
      if (!this.isIgnorePhoneNumber(message?.key?.remoteJid)) {
        const phoneNumber = message?.key?.remoteJid?.split('@')[0];
        if (phoneNumber) {
          const phoneNumberPlus = `+${phoneNumber}`;
          const messages = acc.has(phoneNumberPlus) ? acc.get(phoneNumberPlus) : [];
          messages.push(message);
          acc.set(phoneNumberPlus, messages);
        }
      }

      return acc;
    }, new Map());
  }

  public async getContactsOrderByRecentConversations(
    inbox: inbox,
    provider: ChatwootRaw,
    limit = 50,
  ): Promise<{ id: number; phone_number: string; identifier: string }[]> {
    try {
      const pgClient = postgresClient.getChatwootConnection();

      const sql = `SELECT contacts.id, contacts.identifier, contacts.phone_number
                     FROM conversations
                   JOIN contacts ON contacts.id = conversations.contact_id
                   WHERE conversations.account_id = $1
                     AND inbox_id = $2
                   ORDER BY conversations.last_activity_at DESC
                   LIMIT $3`;

      return (await pgClient.query(sql, [provider.account_id, inbox.id, limit]))?.rows;
    } catch (error) {
      this.logger.error(`Error on get recent conversations: ${error.toString()}`);
    }
  }

  public getContentMessage(chatwootService: ChatwootService, msg: IWebMessageInfo) {
    const contentMessage = chatwootService.getConversationMessage(msg.message);
    if (contentMessage) {
      return contentMessage;
    }

    if (!configService.get<Chatwoot>('CHATWOOT').IMPORT.PLACEHOLDER_MEDIA_MESSAGE) {
      return '';
    }

    const types = {
      documentMessage: msg.message.documentMessage,
      documentWithCaptionMessage: msg.message.documentWithCaptionMessage?.message?.documentMessage,
      imageMessage: msg.message.imageMessage,
      videoMessage: msg.message.videoMessage,
      audioMessage: msg.message.audioMessage,
      stickerMessage: msg.message.stickerMessage,
      templateMessage: msg.message.templateMessage?.hydratedTemplate?.hydratedContentText,
    };
    const typeKey = Object.keys(types).find((key) => types[key] !== undefined);

    switch (typeKey) {
      case 'documentMessage':
        return `_<File: ${msg.message.documentMessage.fileName}${
          msg.message.documentMessage.caption ? ` ${msg.message.documentMessage.caption}` : ''
        }>_`;

      case 'documentWithCaptionMessage':
        return `_<File: ${msg.message.documentWithCaptionMessage.message.documentMessage.fileName}${
          msg.message.documentWithCaptionMessage.message.documentMessage.caption
            ? ` ${msg.message.documentWithCaptionMessage.message.documentMessage.caption}`
            : ''
        }>_`;

      case 'templateMessage':
        return msg.message.templateMessage.hydratedTemplate.hydratedTitleText
          ? `*${msg.message.templateMessage.hydratedTemplate.hydratedTitleText}*\\n`
          : '' + msg.message.templateMessage.hydratedTemplate.hydratedContentText;

      case 'imageMessage':
        return '_<Image Message>_';

      case 'videoMessage':
        return '_<Video Message>_';

      case 'audioMessage':
        return '_<Audio Message>_';

      case 'stickerMessage':
        return '_<Sticker Message>_';

      default:
        return '';
    }
  }

  public sliceIntoChunks(arr: any[], chunkSize: number) {
    return arr.splice(0, chunkSize);
  }

  public isGroup(remoteJid: string) {
    return remoteJid.includes('@g.us');
  }

  public isIgnorePhoneNumber(remoteJid: string) {
    return this.isGroup(remoteJid) || remoteJid === 'status@broadcast' || remoteJid === '0@s.whatsapp.net';
  }
}

export const chatwootImport = new ChatwootImport();
