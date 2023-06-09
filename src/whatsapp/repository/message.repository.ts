import { ConfigService } from '../../config/env.config';
import { join } from 'path';
import { IMessageModel, MessageRaw } from '../models';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { opendirSync, readFileSync } from 'fs';

export class MessageQuery {
  where: MessageRaw;
  limit?: number;
}

export class MessageRepository extends Repository {
  constructor(
    private readonly messageModel: IMessageModel,
    private readonly configService: ConfigService,
  ) {
    super(configService);
  }

  public async insert(data: MessageRaw[], saveDb = false): Promise<IInsert> {
    if (!Array.isArray(data) || data.length === 0) {
      return;
    }

    try {
      if (this.dbSettings.ENABLED && saveDb) {
        const cleanedData = data.map((obj) => {
          const cleanedObj = { ...obj };
          if ('extendedTextMessage' in obj.message) {
            const extendedTextMessage = obj.message.extendedTextMessage as {
              contextInfo?: {
                mentionedJid?: any;
              };
            };

            if (typeof extendedTextMessage === 'object' && extendedTextMessage !== null) {
              if ('contextInfo' in extendedTextMessage) {
                delete extendedTextMessage.contextInfo?.mentionedJid;
                extendedTextMessage.contextInfo = {};
              }
            }
          }
          return cleanedObj;
        });

        const insert = await this.messageModel.insertMany([...cleanedData]);
        return { insertCount: insert.length };
      }

      if (saveDb) {
        data.forEach((msg) =>
          this.writeStore<MessageRaw>({
            path: join(this.storePath, 'messages', msg.owner),
            fileName: msg.key.id,
            data: msg,
          }),
        );

        return { insertCount: data.length };
      }

      return { insertCount: 0 };
    } catch (error) {
      console.log('ERROR: ', error);
      return error;
    } finally {
      data = undefined;
    }
  }

  public async find(query: MessageQuery) {
    try {
      if (this.dbSettings.ENABLED) {
        if (query?.where?.key) {
          for (const [k, v] of Object.entries(query.where.key)) {
            query.where['key.' + k] = v;
          }
          delete query?.where?.key;
        }
        return await this.messageModel
          .find({ ...query.where })
          .sort({ messageTimestamp: -1 })
          .limit(query?.limit ?? 0);
      }

      const messages: MessageRaw[] = [];
      if (query?.where?.key?.id) {
        messages.push(
          JSON.parse(
            readFileSync(
              join(
                this.storePath,
                'messages',
                query.where.owner,
                query.where.key.id + '.json',
              ),
              { encoding: 'utf-8' },
            ),
          ),
        );
      } else {
        const openDir = opendirSync(join(this.storePath, 'messages', query.where.owner), {
          encoding: 'utf-8',
        });

        for await (const dirent of openDir) {
          if (dirent.isFile()) {
            messages.push(
              JSON.parse(
                readFileSync(
                  join(this.storePath, 'messages', query.where.owner, dirent.name),
                  { encoding: 'utf-8' },
                ),
              ),
            );
          }
        }
      }

      return messages
        .sort((x, y) => {
          return (y.messageTimestamp as number) - (x.messageTimestamp as number);
        })
        .splice(0, query?.limit ?? messages.length);
    } catch (error) {
      return [];
    }
  }
}
