import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { ChatwootRaw, IChatwootModel } from '../models';

export class ChatwootRepository extends Repository {
  constructor(private readonly chatwootModel: IChatwootModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('ChatwootRepository');

  public async create(data: ChatwootRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating chatwoot');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving chatwoot to db');
        const insert = await this.chatwootModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('chatwoot saved to db: ' + insert.modifiedCount + ' chatwoot');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving chatwoot to store');

      this.writeStore<ChatwootRaw>({
        path: join(this.storePath, 'chatwoot'),
        fileName: instance,
        data,
      });

      this.logger.verbose('chatwoot saved to store in path: ' + join(this.storePath, 'chatwoot') + '/' + instance);

      this.logger.verbose('chatwoot created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<ChatwootRaw> {
    try {
      this.logger.verbose('finding chatwoot');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding chatwoot in db');
        return await this.chatwootModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding chatwoot in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'chatwoot', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as ChatwootRaw;
    } catch (error) {
      return {};
    }
  }
}
