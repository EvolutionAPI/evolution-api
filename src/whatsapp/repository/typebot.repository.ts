import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { ITypebotModel, TypebotRaw } from '../models';

export class TypebotRepository extends Repository {
  constructor(private readonly typebotModel: ITypebotModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('TypebotRepository');

  public async create(data: TypebotRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating typebot');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving typebot to db');
        const insert = await this.typebotModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('typebot saved to db: ' + insert.modifiedCount + ' typebot');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving typebot to store');

      this.writeStore<TypebotRaw>({
        path: join(this.storePath, 'typebot'),
        fileName: instance,
        data,
      });

      this.logger.verbose('typebot saved to store in path: ' + join(this.storePath, 'typebot') + '/' + instance);

      this.logger.verbose('typebot created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<TypebotRaw> {
    try {
      this.logger.verbose('finding typebot');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding typebot in db');
        return await this.typebotModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding typebot in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'typebot', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as TypebotRaw;
    } catch (error) {
      return {
        enabled: false,
        url: '',
        typebot: '',
        expire: 0,
        sessions: [],
      };
    }
  }
}
