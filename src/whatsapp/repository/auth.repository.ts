import { join } from 'path';
import { Auth, ConfigService } from '../../config/env.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { IAuthModel, AuthRaw } from '../models';
import { readFileSync } from 'fs';
import { AUTH_DIR } from '../../config/path.config';

export class AuthRepository extends Repository {
  constructor(
    private readonly authModel: IAuthModel,
    readonly configService: ConfigService,
  ) {
    super(configService);
    this.auth = configService.get<Auth>('AUTHENTICATION');
  }

  private readonly auth: Auth;

  public async create(data: AuthRaw, instance: string): Promise<IInsert> {
    try {
      if (this.dbSettings.ENABLED) {
        const insert = await this.authModel.replaceOne(
          { _id: instance },
          { ...data },
          { upsert: true },
        );
        return { insertCount: insert.modifiedCount };
      }

      this.writeStore<AuthRaw>({
        path: join(AUTH_DIR, this.auth.TYPE),
        fileName: instance,
        data,
      });

      return { insertCount: 1 };
    } catch (error) {
      return { error } as any;
    }
  }

  public async find(instance: string): Promise<AuthRaw> {
    try {
      if (this.dbSettings.ENABLED) {
        return await this.authModel.findOne({ _id: instance });
      }

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
