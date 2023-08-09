import { readFileSync } from 'fs';
import { join } from 'path';

import { Auth, ConfigService } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { AUTH_DIR } from '../../config/path.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { AuthRaw, IAuthModel } from '../models';

export class AuthRepository extends Repository {
  constructor(private readonly authModel: IAuthModel, readonly configService: ConfigService) {
    super(configService);
    this.auth = configService.get<Auth>('AUTHENTICATION');
  }

  private readonly auth: Auth;
  private readonly logger = new Logger('AuthRepository');

  public async create(data: AuthRaw, instance: string): Promise<IInsert> {
    try {
      this.logger.verbose('creating auth');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('saving auth to db');
        const insert = await this.authModel.replaceOne({ _id: instance }, { ...data }, { upsert: true });

        this.logger.verbose('auth saved to db: ' + insert.modifiedCount + ' auth');
        return { insertCount: insert.modifiedCount };
      }

      this.logger.verbose('saving auth to store');

      this.writeStore<AuthRaw>({
        path: join(AUTH_DIR, this.auth.TYPE),
        fileName: instance,
        data,
      });
      this.logger.verbose('auth saved to store in path: ' + join(AUTH_DIR, this.auth.TYPE) + '/' + instance);

      this.logger.verbose('auth created');
      return { insertCount: 1 };
    } catch (error) {
      return { error } as any;
    }
  }

  public async find(instance: string): Promise<AuthRaw> {
    try {
      this.logger.verbose('finding auth');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding auth in db');
        return await this.authModel.findOne({ _id: instance });
      }

      this.logger.verbose('finding auth in store');

      return JSON.parse(
        readFileSync(join(AUTH_DIR, this.auth.TYPE, instance + '.json'), {
          encoding: 'utf-8',
        }),
      ) as AuthRaw;
    } catch (error) {
      return {};
    }
  }
}
