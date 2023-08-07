import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { IProxyModel, ProxyRaw } from '../models';

export class ProxyRepository extends Repository {
  constructor(private readonly proxyModel: IProxyModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('ProxyRepository');

  public async create(data: ProxyRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating proxy');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving proxy to db');
        const insert = await this.proxyModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('proxy saved to db: ' + insert.modifiedCount + ' proxy');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving proxy to store');

      this.writeStore<ProxyRaw>({
        path: join(this.storePath, 'proxy'),
        fileName: instance,
        data,
      });

      this.logger.verbose('proxy saved to store in path: ' + join(this.storePath, 'proxy') + '/' + instance);

      this.logger.verbose('proxy created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<ProxyRaw> {
    try {
      this.logger.verbose('finding proxy');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding proxy in db');
        return await this.proxyModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding proxy in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'proxy', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as ProxyRaw;
    } catch (error) {
      return {};
    }
  }
}
