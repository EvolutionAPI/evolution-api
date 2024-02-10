import { opendirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { ConfigService, StoreConf } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { ILabelModel, LabelRaw, LabelRawSelect } from '../models';

export class LabelQuery {
  select?: LabelRawSelect;
  where: Partial<LabelRaw>;
}

export class LabelRepository extends Repository {
  constructor(private readonly labelModel: ILabelModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('LabelRepository');

  public async insert(data: LabelRaw, instanceName: string, saveDb = false): Promise<IInsert> {
    this.logger.verbose('inserting labels');

    try {
      if (this.dbSettings.ENABLED && saveDb) {
        this.logger.verbose('saving labels to db');
        const insert = await this.labelModel.findOneAndUpdate({ id: data.id }, data, { upsert: true });

        this.logger.verbose(`label ${data.name} saved to db`);
        return { insertCount: Number(!!insert._id) };
      }

      this.logger.verbose('saving label to store');

      const store = this.configService.get<StoreConf>('STORE');

      if (store.LABELS) {
        this.logger.verbose('saving label to store');
        this.writeStore<LabelRaw>({
          path: join(this.storePath, 'labels', instanceName),
          fileName: data.id,
          data,
        });
        this.logger.verbose(
          'labels saved to store in path: ' + join(this.storePath, 'labels', instanceName) + '/' + data.id,
        );

        this.logger.verbose(`label ${data.name} saved to store`);
        return { insertCount: 1 };
      }

      this.logger.verbose('labels not saved to store');
      return { insertCount: 0 };
    } catch (error) {
      return error;
    } finally {
      data = undefined;
    }
  }

  public async find(query: LabelQuery): Promise<LabelRaw[]> {
    try {
      this.logger.verbose('finding labels');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding labels in db');
        return await this.labelModel.find({ owner: query.where.owner }).select(query.select ?? {});
      }

      this.logger.verbose('finding labels in store');

      const labels: LabelRaw[] = [];
      const openDir = opendirSync(join(this.storePath, 'labels', query.where.owner));
      for await (const dirent of openDir) {
        if (dirent.isFile()) {
          labels.push(
            JSON.parse(
              readFileSync(join(this.storePath, 'labels', query.where.owner, dirent.name), {
                encoding: 'utf-8',
              }),
            ),
          );
        }
      }

      this.logger.verbose('labels found in store: ' + labels.length + ' labels');
      return labels;
    } catch (error) {
      return [];
    }
  }

  public async delete(query: LabelQuery) {
    try {
      this.logger.verbose('deleting labels');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('deleting labels in db');
        return await this.labelModel.deleteOne({ ...query.where });
      }

      this.logger.verbose('deleting labels in store');
      rmSync(join(this.storePath, 'labels', query.where.owner, query.where.id + '.josn'), {
        force: true,
        recursive: true,
      });

      return { deleted: { labelId: query.where.id } };
    } catch (error) {
      return { error: error?.toString() };
    }
  }
}
