import { inbox } from '@figuro/chatwoot-sdk';
import { proto } from '@whiskeysockets/baileys';

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

  public async insertLabel(instanceName: string, accountId: number) {
    const pgClient = postgresClient.getChatwootConnection();
    const sqlCheckLabel = `
      SELECT 1 FROM labels WHERE title = $1 AND account_id = $2
    `;
    const sqlInsertLabel = `
      INSERT INTO labels (title, description, color, show_on_sidebar, account_id, created_at, updated_at)
      VALUES ($1, 'fonte origem do contato', '#2BB32F', TRUE, $2, NOW(), NOW())
      RETURNING *
    `;

    try {
      const checkResult = await pgClient.query(sqlCheckLabel, [instanceName, accountId]);
      if (checkResult.rowCount === 0) {
        const result = await pgClient.query(sqlInsertLabel, [instanceName, accountId]);
        return result.rows[0];
      } else {
        this.logger.info(`Label with title ${instanceName} already exists for account_id ${accountId}`);
        return null;
      }
    } catch (error) {
      this.logger.error(`Error on insert label: ${error.toString()}`);
    }
  }

 public async insertTag(instanceName: string, totalContacts: number) {
    const pgClient = postgresClient.getChatwootConnection();
    const sqlCheckTag = `
      SELECT id FROM tags WHERE name = $1
    `;
    const sqlInsertTag = `
      INSERT INTO tags (name, taggings_count)
      VALUES ($1, $2)
      RETURNING id
    `;

    try {
      const checkResult = await pgClient.query(sqlCheckTag, [instanceName]);
      if (checkResult.rowCount === 0) {
        const result = await pgClient.query(sqlInsertTag, [instanceName, totalContacts]);
        return result.rows[0].id;
      } else {
        this.logger.info(`Tag with name ${instanceName} already exists`);
        // Update taggings_count here
        const updateSql = `
          UPDATE tags
          SET taggings_count = taggings_count + $1
          WHERE name = $2
        `;
        await pgClient.query(updateSql, [totalContacts, instanceName]);
        return checkResult.rows[0].id;
      }
    } catch (error) {
      this.logger.error(`Error on insert tag: ${error.toString()}`);
    }
  }

  public async insertTaggings(instanceName: string, tagId: number, contactIds: number[]) {
    const pgClient = postgresClient.getChatwootConnection();
    const sqlInsertTaggings = `
      INSERT INTO taggings (tag_id, taggable_type, taggable_id, tagger_type, tagger_id, context, created_at)
      VALUES ($1, 'Contact', $2, NULL, NULL, 'labels', NOW())
    `;

    try {
      const bindValues = [tagId];
      for (const contactId of contactIds) {
        bindValues.push(contactId);
        await pgClient.query(sqlInsertTaggings, bindValues);
        bindValues.pop(); // Remove the last added contactId
      }
    } catch (error) {
      this.logger.error(`Error on insert taggings: ${error.toString()}`);
    }
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
      // Inserindo o label uma única vez
      await this.insertLabel(instance.instanceName, Number(provider.account_id));
      const tagId = await this.insertTag(instance.instanceName, contacts.length);
      
      const contactIds: number[] = [];

      while (contactsChunk.length > 0) {
        // Inserindo contatos no banco de dados Chatwoot
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
                        identifier = EXCLUDED.identifier
                        RETURNING id`;

        const result = await pgClient.query(sqlInsert, bindInsert);
        totalContactsImported += result?.rowCount ?? 0;

        // Coletando os IDs dos contatos inseridos ou atualizados
        for (const row of result.rows) {
          contactIds.push(row.id);
        }

        contactsChunk = this.sliceIntoChunks(contacts, 3000);
      }

      // Após inserir todos os contatos, inserir dados na tabela taggings
      await this.insertTaggings(instance.instanceName, tagId, contactIds);

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
        const phoneComparison = a.key.remoteJid.localeCompare(b.key.remoteJid);
        return phoneComparison !== 0 ? phoneComparison : a.messageTimestamp - b.messageTimestamp;
      });

      const firstLastMessageTimestampsByNumber: Map<string, firstLastTimestamp> = new Map();

      for (const message of messagesOrdered) {
        const remoteJid = message.key.remoteJid;
        const timestamp = message.messageTimestamp;

        if (!firstLastMessageTimestampsByNumber.has(remoteJid)) {
          firstLastMessageTimestampsByNumber.set(remoteJid, { first: timestamp, last: timestamp });
        } else {
          const entry = firstLastMessageTimestampsByNumber.get(remoteJid);
          if (timestamp < entry.first) entry.first = timestamp;
          if (timestamp > entry.last) entry.last = timestamp;
        }
      }

      for (const [phoneNumber, timestamps] of firstLastMessageTimestampsByNumber.entries()) {
        const contact = await chatwootService.createContact(
          phoneNumber,
          provider.inbox_id,
          instance.instanceName,
        );

        const conversation = await chatwootService.createConversation(
          phoneNumber,
          provider.inbox_id,
          provider.account_id,
        );

        let chunkedMessages = this.sliceIntoChunks(
          messagesOrdered.filter(m => m.key.remoteJid === phoneNumber),
          3000,
        );

        while (chunkedMessages.length > 0) {
          const chunk = chunkedMessages.shift();
          const sqlInsert = `
            INSERT INTO messages (content, account_id, inbox_id, conversation_id, created_at, updated_at, source_id)
            VALUES ${chunk
              .map(
                _ =>
                  `('${_.message?.conversation || _.message?.extendedTextMessage?.text || ''}',
                    $1, $2, $3, to_timestamp($4), to_timestamp($5), $6)`,
              )
              .join(',')}
            ON CONFLICT (source_id)
            DO NOTHING
          `;

          const bindValues = [
            provider.account_id,
            provider.inbox_id,
            conversation.id,
            ...chunk.flatMap(m => [m.messageTimestamp, m.messageTimestamp, m.key.id]),
          ];

          await pgClient.query(sqlInsert, bindValues);
          totalMessagesImported += chunk.length;
        }
      }

      this.deleteHistoryMessages(instance);

      return totalMessagesImported;
    } catch (error) {
      this.logger.error(`Error on import history messages: ${error.toString()}`);
    }
  }

  public sliceIntoChunks<T>(arr: T[], chunkSize: number): T[] {
    const res = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
      const chunk = arr.slice(i, i + chunkSize);
      res.push(chunk);
    }
    return res;
  }

  private async getChatwootUser(provider: ChatwootRaw): Promise<ChatwootUser> {
    const pgClient = postgresClient.getChatwootConnection();
    const sql = `
      SELECT user_id, user_type FROM users
      WHERE email = $1
    `;
    const result = await pgClient.query(sql, [provider.email]);
    return result.rows[0];
  }
}

export const chatwootImport = new ChatwootImport();
