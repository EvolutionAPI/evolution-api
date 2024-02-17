import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { IntegrationModel, IntegrationRaw } from '../models';

export class IntegrationRepository extends Repository {
  constructor(private readonly integrationModel: IntegrationModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('IntegrationRepository');

  public async create(data: IntegrationRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating integration');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving integration to db');
        const insert = await this.integrationModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('integration saved to db: ' + insert.modifiedCount + ' integration');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving integration to store');

      this.writeStore<IntegrationRaw>({
        path: join(this.storePath, 'integration'),
        fileName: instance,
        data,
      });

      this.logger.verbose(
        'integration saved to store in path: ' + join(this.storePath, 'integration') + '/' + instance,
      );

      this.logger.verbose('integration created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<IntegrationRaw> {
    try {
      this.logger.verbose('finding integration');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding integration in db');
        return await this.integrationModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding integration in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'integration', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as IntegrationRaw;
    } catch (error) {
      return {};
    }
  }
}
