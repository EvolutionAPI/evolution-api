import { IInsert, Repository } from '../abstract/abstract.repository';
import { ConfigService } from '../../config/env.config';
import { join } from 'path';
import { readFileSync } from 'fs';
import { IWebhookModel, WebhookRaw } from '../models';

export class WebhookRepository extends Repository {
  constructor(
    private readonly webhookModel: IWebhookModel,
    private readonly configService: ConfigService,
  ) {
    super(configService);
  }

  public async create(data: WebhookRaw, instance: string): Promise<IInsert> {
    try {
      if (this.dbSettings.ENABLED) {
        const insert = await this.webhookModel.replaceOne(
          { _id: instance },
          { ...data },
          { upsert: true },
        );
        return { insertCount: insert.modifiedCount };
      }

      this.writeStore<WebhookRaw>({
        path: join(this.storePath, 'webhook'),
        fileName: instance,
        data,
      });

      return { insertCount: 1 };
    } catch (error) {
      return error;
    }
  }

  public async find(instance: string): Promise<WebhookRaw> {
    try {
      if (this.dbSettings.ENABLED) {
        return await this.webhookModel.findOne({ _id: instance });
      }

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
