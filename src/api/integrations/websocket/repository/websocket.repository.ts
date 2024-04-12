import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';
import { IInsert, Repository } from '../../../abstract/abstract.repository';
import { IWebsocketModel, WebsocketRaw } from '../../../models';

export class WebsocketRepository extends Repository {
  constructor(private readonly websocketModel: IWebsocketModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('WebsocketRepository');

  public async create(data: WebsocketRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating websocket');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving websocket to db');
        const insert = await this.websocketModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('websocket saved to db: ' + insert.modifiedCount + ' websocket');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving websocket to store');

      this.writeStore<WebsocketRaw>({
        path: join(this.storePath, 'websocket'),
        fileName: instance,
        data,
      });

      this.logger.verbose('websocket saved to store in path: ' + join(this.storePath, 'websocket') + '/' + instance);

      this.logger.verbose('websocket created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<WebsocketRaw> {
    try {
      this.logger.verbose('finding websocket');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding websocket in db');
        return await this.websocketModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding websocket in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'websocket', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as WebsocketRaw;
    } catch (error) {
      return {};
    }
  }
}
