import { opendirSync, readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService, StoreConf } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { IMessageUpModel, MessageUpdateRaw } from '../models';

export class MessageUpQuery {
  where: MessageUpdateRaw;
  limit?: number;
}

export class MessageUpRepository extends Repository {
  constructor(private readonly messageUpModel: IMessageUpModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('MessageUpRepository');

  public async insert(data: MessageUpdateRaw[], instanceName: string, saveDb?: boolean): Promise<IInsert> {
    this.logger.verbose('inserting message up');

    if (data.length === 0) {
      this.logger.verbose('no message up to insert');
      return;
    }

    try {
      if (this.dbSettings.ENABLED && saveDb) {
        this.logger.verbose('saving message up to db');
        const insert = await this.messageUpModel.insertMany([...data]);

        this.logger.verbose('message up saved to db: ' + insert.length + ' message up');
        return { insertCount: insert.length };
      }

      this.logger.verbose('saving message up to store');

      const store = this.configService.get<StoreConf>('STORE');

      if (store.MESSAGE_UP) {
        this.logger.verbose('saving message up to store');
        data.forEach((update) => {
          this.writeStore<MessageUpdateRaw>({
            path: join(this.storePath, 'message-up', instanceName),
            fileName: update.id,
            data: update,
          });
          this.logger.verbose(
            'message up saved to store in path: ' + join(this.storePath, 'message-up', instanceName) + '/' + update.id,
          );
        });

        this.logger.verbose('message up saved to store: ' + data.length + ' message up');
        return { insertCount: data.length };
      }

      this.logger.verbose('message up not saved to store');
      return { insertCount: 0 };
    } catch (error) {
      return error;
    }
  }

  public async find(query: MessageUpQuery) {
    try {
      this.logger.verbose('finding message up');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding message up in db');
        return await this.messageUpModel
          .find({ ...query.where })
          .sort({ datetime: -1 })
          .limit(query?.limit ?? 0);
      }

      this.logger.verbose('finding message up in store');

      const messageUpdate: MessageUpdateRaw[] = [];
      if (query?.where?.id) {
        this.logger.verbose('finding message up in store by id');

        messageUpdate.push(
          JSON.parse(
            readFileSync(join(this.storePath, 'message-up', query.where.owner, query.where.id + '.json'), {
              encoding: 'utf-8',
            }),
          ),
        );
      } else {
        this.logger.verbose('finding message up in store by owner');

        const openDir = opendirSync(join(this.storePath, 'message-up', query.where.owner), {
          encoding: 'utf-8',
        });

        for await (const dirent of openDir) {
          if (dirent.isFile()) {
            messageUpdate.push(
              JSON.parse(
                readFileSync(join(this.storePath, 'message-up', query.where.owner, dirent.name), {
                  encoding: 'utf-8',
                }),
              ),
            );
          }
        }
      }

      this.logger.verbose('message up found in store: ' + messageUpdate.length + ' message up');
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
