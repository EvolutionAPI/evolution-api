import { opendirSync, readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService, StoreConf } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { IMessageModel, MessageRaw } from '../models';

export class MessageQuery {
  where: MessageRaw;
  limit?: number;
}

export class MessageRepository extends Repository {
  constructor(private readonly messageModel: IMessageModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('MessageRepository');

  public async insert(data: MessageRaw[], instanceName: string, saveDb = false): Promise<IInsert> {
    this.logger.verbose('inserting messages');

    if (!Array.isArray(data) || data.length === 0) {
      this.logger.verbose('no messages to insert');
      return;
    }

    try {
      if (this.dbSettings.ENABLED && saveDb) {
        this.logger.verbose('saving messages to db');
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

        this.logger.verbose('messages saved to db: ' + insert.length + ' messages');
        return { insertCount: insert.length };
      }

      this.logger.verbose('saving messages to store');

      const store = this.configService.get<StoreConf>('STORE');

      if (store.MESSAGES) {
        this.logger.verbose('saving messages to store');

        data.forEach((message) => {
          this.writeStore({
            path: join(this.storePath, 'messages', instanceName),
            fileName: message.key.id,
            data: message,
          });
          this.logger.verbose(
            'messages saved to store in path: ' + join(this.storePath, 'messages', instanceName) + '/' + message.key.id,
          );
        });

        this.logger.verbose('messages saved to store: ' + data.length + ' messages');
        return { insertCount: data.length };
      }

      this.logger.verbose('messages not saved to store');
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
      this.logger.verbose('finding messages');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding messages in db');
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

      this.logger.verbose('finding messages in store');
      const messages: MessageRaw[] = [];
      if (query?.where?.key?.id) {
        this.logger.verbose('finding messages in store by id');
        messages.push(
          JSON.parse(
            readFileSync(join(this.storePath, 'messages', query.where.owner, query.where.key.id + '.json'), {
              encoding: 'utf-8',
            }),
          ),
        );
      } else {
        this.logger.verbose('finding messages in store by owner');
        const openDir = opendirSync(join(this.storePath, 'messages', query.where.owner), {
          encoding: 'utf-8',
        });

        for await (const dirent of openDir) {
          if (dirent.isFile()) {
            messages.push(
              JSON.parse(
                readFileSync(join(this.storePath, 'messages', query.where.owner, dirent.name), {
                  encoding: 'utf-8',
                }),
              ),
            );
          }
        }
      }

      this.logger.verbose('messages found in store: ' + messages.length + ' messages');
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
