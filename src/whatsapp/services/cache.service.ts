import NodeCache from 'node-cache';

import { Logger } from '../../config/logger.config';

export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private module: string) {}

  static localCache = new NodeCache({
    stdTTL: 12 * 60 * 60,
  });

  public get(key: string) {
    return CacheService.localCache.get(`${this.module}-${key}`);
  }

  public set(key: string, value) {
    return CacheService.localCache.set(`${this.module}-${key}`, value);
  }

  public has(key: string) {
    return CacheService.localCache.has(`${this.module}-${key}`);
  }

  public delete(key: string) {
    return CacheService.localCache.del(`${this.module}-${key}`);
  }

  public deleteAll() {
    const keys = CacheService.localCache.keys().filter((key) => key.substring(0, this.module.length) === this.module);

    return CacheService.localCache.del(keys);
  }

  public keys() {
    return CacheService.localCache.keys();
  }
}
