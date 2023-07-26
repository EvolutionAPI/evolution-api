import { readFileSync } from 'fs';
import { join } from 'path';

import { ConfigService } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { IWebhookModel, WebhookRaw } from '../models';

export class WebhookRepository extends Repository {
  constructor(private readonly webhookModel: IWebhookModel, private readonly configService: ConfigService) {
    super(configService);
  }

  private readonly logger = new Logger('WebhookRepository');

  public async create(data: WebhookRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating webhook');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving webhook to db');
        const insert = await this.webhookModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('webhook saved to db: ' + insert.modifiedCount + ' webhook');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving webhook to store');

      this.writeStore<WebhookRaw>({
        path: join(this.storePath, 'webhook'),
        fileName: instance,
        data,
      });

      this.logger.verbose('webhook saved to store in path: ' + join(this.storePath, 'webhook') + '/' + instance);

      this.logger.verbose('webhook created');
      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<WebhookRaw> {
    try {
      this.logger.verbose('finding webhook');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding webhook in db');
        return await this.webhookModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding webhook in store');
      return JSON.parse(
        readFileSync(join(this.storePath, 'webhook', instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as WebhookRaw;
    } catch (error) {
      return {};
    }
  }
}
