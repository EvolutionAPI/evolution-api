import { opendirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { ConfigService, StoreConf } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { ChatRaw, ChatRawSelect, IChatModel } from '../models';

export class ChatQuery {
  select?: ChatRawSelect;
  where: ChatRaw;
}

export class ChatRepository extends Repository {
  constructor(private readonly chatModel: IChatModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('ChatRepository');

  public async insert(data: ChatRaw[], instanceName: string, saveDb = false): Promise<IInsert> {
    this.logger.verbose('inserting chats');
    if (data.length === 0) {
      this.logger.verbose('no chats to insert');
      return;
    }

    try {
      this.logger.verbose('saving chats to store');
      if (this.dbSettings.ENABLED && saveDb) {
        this.logger.verbose('saving chats to db');
        const insert = await this.chatModel.insertMany([...data]);

        this.logger.verbose('chats saved to db: ' + insert.length + ' chats');
        return { insertCount: insert.length };
      }

      this.logger.verbose('saving chats to store');

      const store = this.configService.get<StoreConf>('STORE');

      if (store.CHATS) {
        this.logger.verbose('saving chats to store');
        data.forEach((chat) => {
          this.writeStore<ChatRaw>({
            path: join(this.storePath, 'chats', instanceName),
            fileName: chat.id,
            data: chat,
          });
          this.logger.verbose(
            'chats saved to store in path: ' + join(this.storePath, 'chats', instanceName) + '/' + chat.id,
          );
        });

        this.logger.verbose('chats saved to store');
        return { insertCount: data.length };
      }

      this.logger.verbose('chats not saved to store');
      return { insertCount: 0 };
    } catch (error) {
      return error;
    } finally {
      data = undefined;
    }
  }

  public async find(query: ChatQuery): Promise<ChatRaw[]> {
    try {
      this.logger.verbose('finding chats');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding chats in db');
        return await this.chatModel.find({ owner: query.where.owner }).select(query.select ?? {});
      }

      this.logger.verbose('finding chats in store');

      const chats: ChatRaw[] = [];
      const openDir = opendirSync(join(this.storePath, 'chats', query.where.owner));
      for await (const dirent of openDir) {
        if (dirent.isFile()) {
          chats.push(
            JSON.parse(
              readFileSync(join(this.storePath, 'chats', query.where.owner, dirent.name), {
                encoding: 'utf-8',
              }),
            ),
          );
        }
      }

      this.logger.verbose('chats found in store: ' + chats.length + ' chats');
      return chats;
    } catch (error) {
      return [];
    }
  }

  public async delete(query: ChatQuery) {
    try {
      this.logger.verbose('deleting chats');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('deleting chats in db');
        return await this.chatModel.deleteOne({ ...query.where });
      }

      this.logger.verbose('deleting chats in store');
      rmSync(join(this.storePath, 'chats', query.where.owner, query.where.id + '.josn'), {
        force: true,
        recursive: true,
      });

      return { deleted: { chatId: query.where.id } };
    } catch (error) {
      return { error: error?.toString() };
    }
  }

  public async update(data: ChatRaw[], instanceName: string, saveDb = false): Promise<IInsert> {
    try {
      this.logger.verbose('updating chats');

      if (data.length === 0) {
        this.logger.verbose('no chats to update');
        return;
      }

      if (this.dbSettings.ENABLED && saveDb) {
        this.logger.verbose('updating chats in db');

        const chats = data.map((chat) => {
          return {
            updateOne: {
              filter: { id: chat.id },
              update: { ...chat },
              upsert: true,
            },
          };
        });

        const { nModified } = await this.chatModel.bulkWrite(chats);

        this.logger.verbose('chats updated in db: ' + nModified + ' chats');
        return { insertCount: nModified };
      }

      this.logger.verbose('updating chats in store');

      const store = this.configService.get<StoreConf>('STORE');

      if (store.CONTACTS) {
        this.logger.verbose('updating chats in store');
        data.forEach((chat) => {
          this.writeStore({
            path: join(this.storePath, 'chats', instanceName),
            fileName: chat.id,
            data: chat,
          });
          this.logger.verbose(
            'chats updated in store in path: ' + join(this.storePath, 'chats', instanceName) + '/' + chat.id,
          );
        });

        this.logger.verbose('chats updated in store: ' + data.length + ' chats');

        return { insertCount: data.length };
      }

      this.logger.verbose('chats not updated');
      return { insertCount: 0 };
    } catch (error) {
      return error;
    } finally {
      data = undefined;
    }
  }
}
