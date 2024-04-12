import { Logger } from '../../config/logger.config';
import { ICache } from '../abstract/abstract.cache';

export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly cache: ICache) {
    if (cache) {
      this.logger.verbose(`cacheservice created using cache engine: ${cache.constructor?.name}`);
    } else {
      this.logger.verbose(`cacheservice disabled`);
    }
  }

  async get(key: string): Promise<any> {
    if (!this.cache) {
      return;
    }
    this.logger.verbose(`cacheservice getting key: ${key}`);
    return this.cache.get(key);
  }

  async set(key: string, value: any) {
    if (!this.cache) {
      return;
    }
    this.logger.verbose(`cacheservice setting key: ${key}`);
    this.cache.set(key, value);
  }

  async has(key: string) {
    if (!this.cache) {
      return;
    }
    this.logger.verbose(`cacheservice has key: ${key}`);
    return this.cache.has(key);
  }

  async delete(key: string) {
    if (!this.cache) {
      return;
    }
    this.logger.verbose(`cacheservice deleting key: ${key}`);
    return this.cache.delete(key);
  }

  async deleteAll(appendCriteria?: string) {
    if (!this.cache) {
      return;
    }
    this.logger.verbose(`cacheservice deleting all keys`);
    return this.cache.deleteAll(appendCriteria);
  }

  async keys(appendCriteria?: string) {
    if (!this.cache) {
      return;
    }
    this.logger.verbose(`cacheservice getting all keys`);
    return this.cache.keys(appendCriteria);
  }
}
