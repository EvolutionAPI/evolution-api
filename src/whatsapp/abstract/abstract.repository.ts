import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { ConfigService, Database } from '../../config/env.config';
import { ROOT_DIR } from '../../config/path.config';

export type IInsert = { insertCount: number };

export interface IRepository {
  insert(data: any, instanceName: string, saveDb?: boolean): Promise<IInsert>;
  update(data: any, instanceName: string, saveDb?: boolean): Promise<IInsert>;
  find(query: any): Promise<any>;
  delete(query: any, force?: boolean): Promise<any>;

  dbSettings: Database;
  readonly storePath: string;
}

type WriteStore<U> = {
  path: string;
  fileName: string;
  data: U;
};

export abstract class Repository implements IRepository {
  constructor(configService: ConfigService) {
    this.dbSettings = configService.get<Database>('DATABASE');
  }

  dbSettings: Database;
  readonly storePath = join(ROOT_DIR, 'store');

  public writeStore = <T = any>(create: WriteStore<T>) => {
    if (!existsSync(create.path)) {
      mkdirSync(create.path, { recursive: true });
    }
    try {
      writeFileSync(join(create.path, create.fileName + '.json'), JSON.stringify({ ...create.data }), {
        encoding: 'utf-8',
      });

      return { message: 'create - success' };
    } finally {
      create.data = undefined;
    }
  };

  // eslint-disable-next-line
    public insert(data: any, instanceName: string, saveDb = false): Promise<IInsert> {
    throw new Error('Method not implemented.');
  }

  // eslint-disable-next-line
    public update(data: any, instanceName: string, saveDb = false): Promise<IInsert> {
    throw new Error('Method not implemented.');
  }

  // eslint-disable-next-line
    public find(query: any): Promise<any> {
    throw new Error('Method not implemented.');
  }

  // eslint-disable-next-line
    delete(query: any, force?: boolean): Promise<any> {
    throw new Error('Method not implemented.');
  }
}
