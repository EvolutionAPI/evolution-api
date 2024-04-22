import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { IInsert, Repository } from '../../../abstract/abstract.repository';
import { ISqsModel, SqsRaw } from '../../../models';

export class SqsRepository extends Repository {
  constructor(private readonly sqsModel: ISqsModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('SqsRepository');

  public async create(data: SqsRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating sqs');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving sqs to db');
        const insert = await this.sqsModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('sqs saved to db: ' + insert.modifiedCount + ' sqs');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving sqs to store');

      this.writeStore<SqsRaw>({
        path: join(this.storePath, 'sqs'),
        fileName: instance,
        data,
      });

      this.logger.verbose('sqs saved to store in path: ' + join(this.storePath, 'sqs') + '/' + instance);

      this.logger.verbose('sqs created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<SqsRaw> {
    try {
      this.logger.verbose('finding sqs');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding sqs in db');
        return await this.sqsModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding sqs in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'sqs', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as SqsRaw;
    } catch (error) {
      return {};
    }
  }
}
