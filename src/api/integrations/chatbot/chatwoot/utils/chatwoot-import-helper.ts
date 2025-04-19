import { InstanceDto } from '@api/dto/instance.dto';
import { ChatwootDto } from '@api/integrations/chatbot/chatwoot/dto/chatwoot.dto';
import { postgresClient } from '@api/integrations/chatbot/chatwoot/libs/postgres.client';
import { ChatwootService } from '@api/integrations/chatbot/chatwoot/services/chatwoot.service';
import { Chatwoot, configService } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { inbox } from '@figuro/chatwoot-sdk';
import { Chatwoot as ChatwootModel, Contact, Message } from '@prisma/client';
import { proto } from 'baileys';

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
  private logger = new Logger('ChatwootImport');
  private repositoryMessagesCache = new Map<string, Set<string>>();
  private historyMessages = new Map<string, Message[]>();
  private historyContacts = new Map<string, Contact[]>();

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

  public addHistoryMessages(instance: InstanceDto, messagesRaw: Message[]) {
    const actualValue = this.historyMessages.has(instance.instanceName)
      ? this.historyMessages.get(instance.instanceName)
      : [];
    this.historyMessages.set(instance.instanceName, [...actualValue, ...messagesRaw]);
  }

  public addHistoryContacts(instance: InstanceDto, contactsRaw: Contact[]) {
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

  public async importHistoryContacts(instance: InstanceDto, provider: ChatwootDto) {
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

      const contactBatches = this.sliceIntoChunks(contacts, 3000);
      for (const contactsChunk of contactBatches) {
        const labelSql = `SELECT id FROM labels WHERE title = '${provider.nameInbox}' AND account_id = ${provider.accountId} LIMIT 1`;

        let labelId = (await pgClient.query(labelSql))?.rows[0]?.id;

        if (!labelId) {
          // creating label in chatwoot db and getting the id
          const sqlLabel = `INSERT INTO labels (title, color, show_on_sidebar, account_id, created_at, updated_at) VALUES ('${provider.nameInbox}', '#34039B', true, ${provider.accountId}, NOW(), NOW()) RETURNING id`;

          labelId = (await pgClient.query(sqlLabel))?.rows[0]?.id;
        }

        // inserting contacts in chatwoot db
        let sqlInsert = `INSERT INTO contacts
          (name, phone_number, account_id, identifier, created_at, updated_at) VALUES `;
        const bindInsert = [provider.accountId];

        for (const contact of contactsChunk) {
          bindInsert.push(contact.pushName);
          const bindName = `$${bindInsert.length}`;

          bindInsert.push(`+${contact.remoteJid.split('@')[0]}`);
          const bindPhoneNumber = `$${bindInsert.length}`;

          bindInsert.push(contact.remoteJid);
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

        const sqlTags = `SELECT id FROM tags WHERE name = '${provider.nameInbox}' LIMIT 1`;

        const tagData = (await pgClient.query(sqlTags))?.rows[0];
        let tagId = tagData?.id;

        const sqlTag = `INSERT INTO tags (name, taggings_count) VALUES ('${provider.nameInbox}', ${totalContactsImported}) ON CONFLICT (name) DO UPDATE SET taggings_count = tags.taggings_count + ${totalContactsImported} RETURNING id`;

        tagId = (await pgClient.query(sqlTag))?.rows[0]?.id;

        await pgClient.query(sqlTag);

        let sqlInsertLabel = `INSERT INTO taggings (tag_id, taggable_type, taggable_id, context, created_at) VALUES `;

        contactsChunk.forEach((contact) => {
          const bindTaggableId = `(SELECT id FROM contacts WHERE identifier = '${contact.remoteJid}' AND account_id = ${provider.accountId})`;
          sqlInsertLabel += `($1, $2, ${bindTaggableId}, $3, NOW()),`;
        });

        if (sqlInsertLabel.slice(-1) === ',') {
          sqlInsertLabel = sqlInsertLabel.slice(0, -1);
        }

        await pgClient.query(sqlInsertLabel, [tagId, 'Contact', 'labels']);
       
      }

      this.deleteHistoryContacts(instance);

      return totalContactsImported;
    } catch (error) {
      this.logger.error(`Error on import history contacts: ${error.toString()}`);
    }
  }

  public async getExistingSourceIds(sourceIds: string[]): Promise<Set<string>> {
    try {
      const existingSourceIdsSet = new Set<string>();

      if (sourceIds.length === 0) {
        return existingSourceIdsSet;
      }

      const formattedSourceIds = sourceIds.map((sourceId) => `WAID:${sourceId.replace('WAID:', '')}`); // Make sure the sourceId is always formatted as WAID:1234567890
      const query = 'SELECT source_id FROM messages WHERE source_id = ANY($1)';
      const pgClient = postgresClient.getChatwootConnection();
      const result = await pgClient.query(query, [formattedSourceIds]);

      for (const row of result.rows) {
        existingSourceIdsSet.add(row.source_id);
      }

      return existingSourceIdsSet;
    } catch (error) {
      return null;
    }
  }

  public async importHistoryMessages(
    instance: InstanceDto,
    chatwootService: ChatwootService,
    inbox: inbox,
    provider: ChatwootModel,
  ) {
    try {
      this.logger.info(
        `[importHistoryMessages] Iniciando importação de mensagens para a instância "${instance.instanceName}".`
      );

      const pgClient = postgresClient.getChatwootConnection();

      const chatwootUser = await this.getChatwootUser(provider);
      if (!chatwootUser) {
        throw new Error('User not found to import messages.');
      }

      let totalMessagesImported = 0;

      let messagesOrdered = this.historyMessages.get(instance.instanceName) || [];
      this.logger.info(
        `[importHistoryMessages] Número de mensagens recuperadas do histórico: ${messagesOrdered.length}.`
      );
      if (messagesOrdered.length === 0) {
        return 0;
      }

      // Ordenando as mensagens por remoteJid e timestamp (ascendente)
      messagesOrdered.sort((a, b) => {
        const aKey = a.key as { remoteJid: string };
        const bKey = b.key as { remoteJid: string };

        const aMessageTimestamp = a.messageTimestamp as any as number;
        const bMessageTimestamp = b.messageTimestamp as any as number;

        return parseInt(aKey.remoteJid) - parseInt(bKey.remoteJid) || aMessageTimestamp - bMessageTimestamp;
      });
      this.logger.info('[importHistoryMessages] Mensagens ordenadas por remoteJid e messageTimestamp.');

      // Mapeando mensagens por telefone
      const allMessagesMappedByPhoneNumber = this.createMessagesMapByPhoneNumber(messagesOrdered);
      this.logger.info(
        `[importHistoryMessages] Mensagens mapeadas para ${allMessagesMappedByPhoneNumber.size} números únicos.`
      );

      // Map: +numero => { first: timestamp, last: timestamp }
      const phoneNumbersWithTimestamp = new Map<string, firstLastTimestamp>();
      allMessagesMappedByPhoneNumber.forEach((messages: Message[], phoneNumber: string) => {
        phoneNumbersWithTimestamp.set(phoneNumber, {
          first: messages[0]?.messageTimestamp as any as number,
          last: messages[messages.length - 1]?.messageTimestamp as any as number,
        });
      });
      this.logger.info(
        `[importHistoryMessages] Criado mapa de timestamps para ${phoneNumbersWithTimestamp.size} números.`
      );

      // Removendo mensagens que já existem no banco (verificação pelo source_id)
      const existingSourceIds = await this.getExistingSourceIds(
        messagesOrdered.map((message: any) => message.key.id)
      );
      this.logger.info(
        `[importHistoryMessages] Quantidade de source_ids existentes no banco: ${existingSourceIds.size}.`
      );
      const initialCount = messagesOrdered.length;
      messagesOrdered = messagesOrdered.filter((message: any) => !existingSourceIds.has(message.key.id));
      this.logger.info(
        `[importHistoryMessages] Mensagens filtradas: de ${initialCount} para ${messagesOrdered.length} após remoção de duplicados.`
      );

      // Processamento das mensagens em batches
      const batchSize = 4000;
      let messagesChunks = this.sliceIntoChunks(messagesOrdered, batchSize);
      let batchNumber = 1;
      for (const messagesChunk of messagesChunks) {
        this.logger.info(
          `[importHistoryMessages] Processando batch ${batchNumber} com ${messagesChunk.length} mensagens.`
        );

        // Agrupando as mensagens deste batch por telefone
        const messagesByPhoneNumber = this.createMessagesMapByPhoneNumber(messagesChunk);
        this.logger.info(
          `[importHistoryMessages] Batch ${batchNumber}: ${messagesByPhoneNumber.size} números únicos encontrados.`
        );

        if (messagesByPhoneNumber.size > 0) {
          const fksByNumber = await this.selectOrCreateFksFromChatwoot(
            provider,
            inbox,
            phoneNumbersWithTimestamp,
            messagesByPhoneNumber,
          );
          this.logger.info(
            `[importHistoryMessages] Batch ${batchNumber}: FKs recuperados para ${fksByNumber.size} números.`
          );

          // Inserindo as mensagens no banco
          let sqlInsertMsg = `INSERT INTO messages
            (content, processed_message_content, account_id, inbox_id, conversation_id, message_type, private, content_type,
            sender_type, sender_id, source_id, created_at, updated_at) VALUES `;
          const bindInsertMsg = [provider.accountId, inbox.id];

          messagesByPhoneNumber.forEach((messages: any[], phoneNumber: string) => {
            const fksChatwoot = fksByNumber.get(phoneNumber);
            this.logger.info(
              `[importHistoryMessages] Número ${phoneNumber}: processando ${messages.length} mensagens.`
            );
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

              bindInsertMsg.push('WAID:' + message.key.id);
              const bindSourceId = `$${bindInsertMsg.length}`;

              bindInsertMsg.push(message.messageTimestamp as number);
              const bindmessageTimestamp = `$${bindInsertMsg.length}`;

              sqlInsertMsg += `(${bindContent}, ${bindContent}, $1, $2, ${bindConversationId}, ${bindMessageType}, FALSE, 0,
                  ${bindSenderType},${bindSenderId},${bindSourceId}, to_timestamp(${bindmessageTimestamp}), to_timestamp(${bindmessageTimestamp})),`;
            });
          });
          if (bindInsertMsg.length > 2) {
            if (sqlInsertMsg.slice(-1) === ',') {
              sqlInsertMsg = sqlInsertMsg.slice(0, -1);
            }
            const result = await pgClient.query(sqlInsertMsg, bindInsertMsg);
            const rowCount = result?.rowCount ?? 0;
            totalMessagesImported += rowCount;
            this.logger.info(
              `[importHistoryMessages] Batch ${batchNumber}: Inseridas ${rowCount} mensagens no banco.`
            );
          }
        }
        batchNumber++;
        
      }

      this.deleteHistoryMessages(instance);
      this.deleteRepositoryMessagesCache(instance);
      this.logger.info(
        `[importHistoryMessages] Histórico e cache de mensagens da instância "${instance.instanceName}" foram limpos.`
      );

      const providerData: ChatwootDto = {
        ...provider,
        ignoreJids: Array.isArray(provider.ignoreJids) ? provider.ignoreJids.map((event) => String(event)) : [],
      };

      this.logger.info(
        `[importHistoryMessages] Iniciando importação de contatos do histórico para a instância "${instance.instanceName}".`
      );
      await this.importHistoryContacts(instance, providerData);

      this.logger.info(
        `[importHistoryMessages] Concluída a importação de mensagens para a instância "${instance.instanceName}". Total importado: ${totalMessagesImported}.`
      );
      return totalMessagesImported;
    } catch (error) {
      this.logger.error(`Error on import history messages: ${error.toString()}`);
      this.deleteHistoryMessages(instance);
      this.deleteRepositoryMessagesCache(instance);
    }
  }


  private normalizeBrazilianPhoneNumberOptions(raw: string): [string, string] {
    if (!raw.startsWith('+55')) {
      return [raw, raw];
    }

    // Remove o prefixo "+55"
    const digits = raw.slice(3); // pega tudo após os 3 primeiros caracteres

    if (digits.length === 10) {
      // Se tiver 10 dígitos, assume que é o formato antigo.
      // Old: exatamente o valor recebido.
      // New: insere o '9' após os dois primeiros dígitos.
      const newDigits = digits.slice(0, 2) + '9' + digits.slice(2);
      return [raw, `+55${newDigits}`];
    } else if (digits.length === 11) {
      // Se tiver 11 dígitos, assume que é o formato novo.
      // New: exatamente o valor recebido.
      // Old: remove o dígito extra na terceira posição.
      const oldDigits = digits.slice(0, 2) + digits.slice(3);
      return [`+55${oldDigits}`, raw];
    } else {
      // Se por algum motivo tiver outra quantidade de dígitos, retorna os mesmos valores.
      return [raw, raw];
    }
  }


  public async selectOrCreateFksFromChatwoot(
    provider: ChatwootModel,
    inbox: inbox,
    phoneNumbersWithTimestamp: Map<string, firstLastTimestamp>,
    messagesByPhoneNumber: Map<string, Message[]>
  ): Promise<Map<string, FksChatwoot>> {
    const pgClient = postgresClient.getChatwootConnection();
    const resultMap = new Map<string, FksChatwoot>();

    for (const rawPhone of messagesByPhoneNumber.keys()) {
      // 1) Normalizar telefone e gerar JIDs
      const [normalizedWith, normalizedWithout] =
        this.normalizeBrazilianPhoneNumberOptions(rawPhone);
      const jidWith = normalizedWith.replace(/^\+/, '') + '@s.whatsapp.net';
      const jidWithout = normalizedWithout.replace(/^\+/, '') + '@s.whatsapp.net';

      const ts = phoneNumbersWithTimestamp.get(rawPhone);
      if (!ts) {
        this.logger.warn(`Timestamp não encontrado para ${rawPhone}`);
        throw new Error(`Timestamp não encontrado para ${rawPhone}`);
      }

      // 2) Buscar ou inserir Contact (agora incluindo identifier)
      let contact: { id: number; phone_number: string };
      {
        const selectContact = `
          SELECT id, phone_number
            FROM contacts
           WHERE account_id = $1
             AND (
               phone_number = $2
               OR phone_number = $3
               OR identifier   = $4
               OR identifier   = $5
             )
           LIMIT 1
        `;
        const res = await pgClient.query(selectContact, [
          provider.accountId,
          normalizedWith,
          normalizedWithout,
          jidWith,
          jidWithout
        ]);
        if (res.rowCount) {
          contact = res.rows[0];
          this.logger.verbose(`Contato existente: ${JSON.stringify(contact)}`);
        } else {
          const insertContact = `
          INSERT INTO contacts
            (name, phone_number, account_id, identifier, created_at, updated_at)
          VALUES
            (
              REPLACE($2, '+', ''),
              $2,
              $1,
              $5,                -- agora é $5
              to_timestamp($3),
              to_timestamp($4)
            )
          RETURNING id, phone_number
        `;
          const insertRes = await pgClient.query(insertContact, [
            provider.accountId,   // $1
            normalizedWith,       // $2
            ts.first,             // $3
            ts.last,              // $4
            jidWith               // $5
          ]);
          contact = insertRes.rows[0];


          this.logger.verbose(`Contato inserido: ${JSON.stringify(contact)}`);
        }
      }

      // 3) Buscar ou inserir ContactInbox
      let contactInboxId: number;
      {
        const selectCi = `
          SELECT id
            FROM contact_inboxes
           WHERE contact_id = $1
             AND inbox_id   = $2
           LIMIT 1
        `;
        const ciRes = await pgClient.query(selectCi, [
          contact.id,
          inbox.id
        ]);
        if (ciRes.rowCount) {
          contactInboxId = ciRes.rows[0].id;
          this.logger.verbose(`Contact_inbox existente: ${contactInboxId}`);
        } else {
          const insertCi = `
            INSERT INTO contact_inboxes
              (contact_id, inbox_id, source_id, created_at, updated_at)
            VALUES
              ($1, $2, gen_random_uuid(), NOW(), NOW())
            RETURNING id
          `;
          const insertRes = await pgClient.query(insertCi, [
            contact.id,
            inbox.id
          ]);
          contactInboxId = insertRes.rows[0].id;
          this.logger.verbose(`Contact_inbox inserido: ${contactInboxId}`);
        }
      }

      // 4) Buscar ou inserir Conversation
      let conversationId: number;
      {
        const selectConv = `
          SELECT id
            FROM conversations
           WHERE account_id = $1
             AND inbox_id   = $2
             AND contact_id = $3
           LIMIT 1
        `;
        const convRes = await pgClient.query(selectConv, [
          provider.accountId,
          inbox.id,
          contact.id
        ]);
        if (convRes.rowCount) {
          conversationId = convRes.rows[0].id;
          this.logger.verbose(`Conversa existente: ${conversationId}`);
        } else {
          const insertConv = `
            INSERT INTO conversations
              (account_id, inbox_id, status, contact_id, contact_inbox_id, uuid,
               last_activity_at, created_at, updated_at)
            VALUES
              ($1, $2, 0, $3, $4, gen_random_uuid(), NOW(), NOW(), NOW())
            RETURNING id
          `;
          const insertRes = await pgClient.query(insertConv, [
            provider.accountId,
            inbox.id,
            contact.id,
            contactInboxId
          ]);
          conversationId = insertRes.rows[0].id;
          this.logger.verbose(`Conversa inserida: ${conversationId}`);
        }
      }

      resultMap.set(rawPhone, {
        phone_number: normalizedWith,
        contact_id: String(contact.id),
        conversation_id: String(conversationId)
      });
    }

    return resultMap;
  }






















  public async getChatwootUser(provider: ChatwootModel): Promise<ChatwootUser> {
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

  public createMessagesMapByPhoneNumber(messages: Message[]): Map<string, Message[]> {
    return messages.reduce((acc: Map<string, Message[]>, message: Message) => {
      const key = message?.key as {
        remoteJid: string;
      };
      if (!this.isIgnorePhoneNumber(key?.remoteJid)) {
        const phoneNumber = key?.remoteJid?.split('@')[0];
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
    provider: ChatwootModel,
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

      return (await pgClient.query(sql, [provider.accountId, inbox.id, limit]))?.rows;
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
        return `_<File: ${msg.message.documentMessage.fileName}${msg.message.documentMessage.caption ? ` ${msg.message.documentMessage.caption}` : ''
          }>_`;

      case 'documentWithCaptionMessage':
        return `_<File: ${msg.message.documentWithCaptionMessage.message.documentMessage.fileName}${msg.message.documentWithCaptionMessage.message.documentMessage.caption
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

  public sliceIntoChunks<T>(arr: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
      chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
  }

  public isGroup(remoteJid: string) {
    return remoteJid.includes('@g.us');
  }

  public isIgnorePhoneNumber(remoteJid: string) {
    return this.isGroup(remoteJid) || remoteJid === 'status@broadcast' || remoteJid === '0@s.whatsapp.net';
  }

  public updateMessageSourceID(messageId: string | number, sourceId: string) {
    const pgClient = postgresClient.getChatwootConnection();

    const sql = `UPDATE messages SET source_id = $1, status = 0, created_at = NOW(), updated_at = NOW() WHERE id = $2;`;

    return pgClient.query(sql, [`WAID:${sourceId}`, messageId]);
  }
}

export const chatwootImport = new ChatwootImport();
