import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { IInsert, Repository } from '../../../abstract/abstract.repository';
import { ChamaaiRaw, IChamaaiModel } from '../../../models';

export class ChamaaiRepository extends Repository {
  constructor(private readonly chamaaiModel: IChamaaiModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('ChamaaiRepository');

  public async create(data: ChamaaiRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating chamaai');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving chamaai to db');
        const insert = await this.chamaaiModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('chamaai saved to db: ' + insert.modifiedCount + ' chamaai');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving chamaai to store');

      this.writeStore<ChamaaiRaw>({
        path: join(this.storePath, 'chamaai'),
        fileName: instance,
        data,
      });

      this.logger.verbose('chamaai saved to store in path: ' + join(this.storePath, 'chamaai') + '/' + instance);

      this.logger.verbose('chamaai created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<ChamaaiRaw> {
    try {
      this.logger.verbose('finding chamaai');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding chamaai in db');
        return await this.chamaaiModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding chamaai in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'chamaai', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as ChamaaiRaw;
    } catch (error) {
      return {};
    }
  }
}
