import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { ISettingsModel, SettingsRaw } from '../models';

export class SettingsRepository extends Repository {
  constructor(private readonly settingsModel: ISettingsModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('SettingsRepository');

  public async create(data: SettingsRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating settings');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving settings to db');
        const insert = await this.settingsModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('settings saved to db: ' + insert.modifiedCount + ' settings');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving settings to store');

      this.writeStore<SettingsRaw>({
        path: join(this.storePath, 'settings'),
        fileName: instance,
        data,
      });

      this.logger.verbose('settings saved to store in path: ' + join(this.storePath, 'settings') + '/' + instance);

      this.logger.verbose('settings created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<SettingsRaw> {
    try {
      this.logger.verbose('finding settings');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding settings in db');
        return await this.settingsModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding settings in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'settings', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as SettingsRaw;
    } catch (error) {
      return {};
    }
  }
}
