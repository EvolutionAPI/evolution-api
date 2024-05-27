import { opendirSync, readFileSync } from 'fs';
import { join } from 'path';

import { Auth, ConfigService } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { AUTH_DIR } from '../../config/path.config';
import { IInsert, Repository } from '../abstract/abstract.repository';
import { AuthRaw, IAuthModel, IntegrationModel } from '../models';

export class AuthRepository extends Repository {
  constructor(
    private readonly authModel: IAuthModel,
    private readonly integrationModel: IntegrationModel,
    readonly configService: ConfigService,
  ) {
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

  public async findByKey(key: string): Promise<AuthRaw> {
    try {
      this.logger.verbose('finding auth');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding auth in db');
        return await this.authModel.findOne({ apikey: key });
      }

      return {};
    } catch (error) {
      return {};
    }
  }

  public async list(): Promise<AuthRaw[]> {
    try {
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('listing auth in db');
        return await this.authModel.find();
      }

      this.logger.verbose('listing auth in store');

      const auths: AuthRaw[] = [];
      const openDir = opendirSync(join(AUTH_DIR, this.auth.TYPE), {
        encoding: 'utf-8',
      });
      for await (const dirent of openDir) {
        if (dirent.isFile()) {
          auths.push(
            JSON.parse(
              readFileSync(join(AUTH_DIR, this.auth.TYPE, dirent.name), {
                encoding: 'utf-8',
              }),
            ),
          );
        }
      }

      return auths;
    } catch (error) {
      return [];
    }
  }

  public async findInstanceNameById(instanceId: string): Promise<string | null> {
    try {
      this.logger.verbose('finding auth by instanceId');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding auth in db');
        const response = await this.authModel.findOne({ instanceId });

        return response._id;
      }

      this.logger.verbose('finding auth in store is not supported');
    } catch (error) {
      return null;
    }
  }

  public async findInstanceNameByNumber(number: string): Promise<string | null> {
    try {
      this.logger.verbose('finding auth by number');
      if (this.dbSettings.ENABLED) {
        this.logger.verbose('finding auth in db');
        const instance = await this.integrationModel.findOne({ number });

        const response = await this.authModel.findOne({ _id: instance._id });

        return response._id;
      }

      this.logger.verbose('finding auth in store is not supported');
    } catch (error) {
      return null;
    }
  }
}
