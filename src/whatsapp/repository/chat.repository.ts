import { join } from 'path';
import { ConfigService } from '../../config/env.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { opendirSync, readFileSync, rmSync } from 'fs';
import { ChatRaw, IChatModel } from '../models';

export class ChatQuery {
  where: ChatRaw;
}

export class ChatRepository extends Repository {
  constructor(
    private readonly chatModel: IChatModel,
    private readonly configService: ConfigService,
  ) {
    super(configService);
  }

  public async insert(data: ChatRaw[], saveDb = false): Promise<IInsert> {
    if (data.length === 0) {
      return;
    }

    try {
      if (this.dbSettings.ENABLED && saveDb) {
        const insert = await this.chatModel.insertMany([...data]);
        return { insertCount: insert.length };
      }

      data.forEach((chat) => {
        this.writeStore<ChatRaw>({
          path: join(this.storePath, 'chats', chat.owner),
          fileName: chat.id,
          data: chat,
        });
      });

      return { insertCount: data.length };
    } catch (error) {
      return error;
    } finally {
      data = undefined;
    }
  }

  public async find(query: ChatQuery): Promise<ChatRaw[]> {
    try {
      if (this.dbSettings.ENABLED) {
        return await this.chatModel.find({ owner: query.where.owner });
      }

      const chats: ChatRaw[] = [];
      const openDir = opendirSync(join(this.storePath, 'chats', query.where.owner));
      for await (const dirent of openDir) {
        if (dirent.isFile()) {
          chats.push(
            JSON.parse(
              readFileSync(
                join(this.storePath, 'chats', query.where.owner, dirent.name),
                { encoding: 'utf-8' },
              ),
            ),
          );
        }
      }

      return chats;
    } catch (error) {
      return [];
    }
  }

  public async delete(query: ChatQuery) {
    try {
      if (this.dbSettings.ENABLED) {
        return await this.chatModel.deleteOne({ ...query.where });
      }

      rmSync(join(this.storePath, 'chats', query.where.owner, query.where.id + '.josn'), {
        force: true,
        recursive: true,
      });

      return { deleted: { chatId: query.where.id } };
    } catch (error) {
      return { error: error?.toString() };
    }
  }
}
