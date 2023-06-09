import { ConfigService } from '../../config/env.config';
import { IMessageUpModel, MessageUpdateRaw } from '../models';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { join } from 'path';
import { opendirSync, readFileSync } from 'fs';

export class MessageUpQuery {
  where: MessageUpdateRaw;
  limit?: number;
}

export class MessageUpRepository extends Repository {
  constructor(
    private readonly messageUpModel: IMessageUpModel,
    private readonly configService: ConfigService,
  ) {
    super(configService);
  }

  public async insert(data: MessageUpdateRaw[], saveDb?: boolean): Promise<IInsert> {
    if (data.length === 0) {
      return;
    }

    try {
      if (this.dbSettings.ENABLED && saveDb) {
        const insert = await this.messageUpModel.insertMany([...data]);
        return { insertCount: insert.length };
      }

      data.forEach((update) => {
        this.writeStore<MessageUpdateRaw>({
          path: join(this.storePath, 'message-up', update.owner),
          fileName: update.id,
          data: update,
        });
      });
    } catch (error) {
      return error;
    }
  }

  public async find(query: MessageUpQuery) {
    try {
      if (this.dbSettings.ENABLED) {
        return await this.messageUpModel
          .find({ ...query.where })
          .sort({ datetime: -1 })
          .limit(query?.limit ?? 0);
      }

      const messageUpdate: MessageUpdateRaw[] = [];
      if (query?.where?.id) {
        messageUpdate.push(
          JSON.parse(
            readFileSync(
              join(
                this.storePath,
                'message-up',
                query.where.owner,
                query.where.id + '.json',
              ),
              { encoding: 'utf-8' },
            ),
          ),
        );
      } else {
        const openDir = opendirSync(
          join(this.storePath, 'message-up', query.where.owner),
          { encoding: 'utf-8' },
        );

        for await (const dirent of openDir) {
          if (dirent.isFile()) {
            messageUpdate.push(
              JSON.parse(
                readFileSync(
                  join(this.storePath, 'message-up', query.where.owner, dirent.name),
                  { encoding: 'utf-8' },
                ),
              ),
            );
          }
        }
      }

      return messageUpdate
        .sort((x, y) => {
          return y.datetime - x.datetime;
        })
        .splice(0, query?.limit ?? messageUpdate.length);
    } catch (error) {
      return [];
    }
  }
}
