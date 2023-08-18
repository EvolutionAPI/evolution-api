import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { IRabbitmqModel, RabbitmqRaw } from '../models';

export class RabbitmqRepository extends Repository {
  constructor(private readonly rabbitmqModel: IRabbitmqModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('RabbitmqRepository');

  public async create(data: RabbitmqRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating rabbitmq');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving rabbitmq to db');
        const insert = await this.rabbitmqModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('rabbitmq saved to db: ' + insert.modifiedCount + ' rabbitmq');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving rabbitmq to store');

      this.writeStore<RabbitmqRaw>({
        path: join(this.storePath, 'rabbitmq'),
        fileName: instance,
        data,
      });

      this.logger.verbose('rabbitmq saved to store in path: ' + join(this.storePath, 'rabbitmq') + '/' + instance);

      this.logger.verbose('rabbitmq created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<RabbitmqRaw> {
    try {
      this.logger.verbose('finding rabbitmq');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding rabbitmq in db');
        return await this.rabbitmqModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding rabbitmq in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'rabbitmq', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as RabbitmqRaw;
    } catch (error) {
      return {};
    }
  }
}
