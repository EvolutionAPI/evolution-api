import NodeCache from 'node-cache';

import { ICache } from '../api/abstract/abstract.cache';
import { CacheConf, CacheConfLocal, ConfigService } from '../config/env.config';

export class LocalCache implements ICache {
  private conf: CacheConfLocal;
  static localCache = new NodeCache();

  constructor(private readonly configService: ConfigService, private readonly module: string) {
    this.conf = this.configService.get<CacheConf>('CACHE')?.LOCAL;
  }

  async get(key: string): Promise<any> {
    return LocalCache.localCache.get(this.buildKey(key));
  }

  async set(key: string, value: any, ttl?: number) {
    return LocalCache.localCache.set(this.buildKey(key), value, ttl || this.conf.TTL);
  }

  async has(key: string) {
    return LocalCache.localCache.has(this.buildKey(key));
  }

  async delete(key: string) {
    return LocalCache.localCache.del(this.buildKey(key));
  }

  async deleteAll(appendCriteria?: string) {
    const keys = await this.keys(appendCriteria);
    if (!keys?.length) {
      return 0;
    }

    return LocalCache.localCache.del(keys);
  }

  async keys(appendCriteria?: string) {
    const filter = `${this.buildKey('')}${appendCriteria ? `${appendCriteria}:` : ''}`;

    return LocalCache.localCache.keys().filter((key) => key.substring(0, filter.length) === filter);
  }

  buildKey(key: string) {
    return `${this.module}:${key}`;
  }

  async hGet() {
    console.log('hGet not implemented');
  }

  async hSet() {
    console.log('hSet not implemented');
  }

  async hDelete() {
    console.log('hDelete not implemented');
    return 0;
  }
}
