import { RedisClientType } from 'redis';

import { ICache } from '../api/abstract/abstract.cache';
import { CacheConf, CacheConfRedis, ConfigService } from '../config/env.config';
import { Logger } from '../config/logger.config';
import { redisClient } from './rediscache.client';

export class RedisCache implements ICache {
  private readonly logger = new Logger(RedisCache.name);
  private client: RedisClientType;
  private conf: CacheConfRedis;

  constructor(private readonly configService: ConfigService, private readonly module: string) {
    this.conf = this.configService.get<CacheConf>('CACHE')?.REDIS;
    this.client = redisClient.getConnection();
  }

  async get(key: string): Promise<any> {
    try {
      return JSON.parse(await this.client.get(this.buildKey(key)));
    } catch (error) {
      this.logger.error(error);
    }
  }

  async set(key: string, value: any, ttl?: number) {
    try {
      await this.client.setEx(this.buildKey(key), ttl || this.conf?.TTL, JSON.stringify(value));
    } catch (error) {
      this.logger.error(error);
    }
  }

  async has(key: string) {
    try {
      return (await this.client.exists(this.buildKey(key))) > 0;
    } catch (error) {
      this.logger.error(error);
    }
  }

  async delete(key: string) {
    try {
      return await this.client.del(this.buildKey(key));
    } catch (error) {
      this.logger.error(error);
    }
  }

  async deleteAll(appendCriteria?: string) {
    try {
      const keys = await this.keys(appendCriteria);
      if (!keys?.length) {
        return 0;
      }

      return await this.client.del(keys);
    } catch (error) {
      this.logger.error(error);
    }
  }

  async keys(appendCriteria?: string) {
    try {
      const match = `${this.buildKey('')}${appendCriteria ? `${appendCriteria}:` : ''}*`;
      const keys = [];
      for await (const key of this.client.scanIterator({
        MATCH: match,
        COUNT: 100,
      })) {
        keys.push(key);
      }

      return [...new Set(keys)];
    } catch (error) {
      this.logger.error(error);
    }
  }

  buildKey(key: string) {
    return `${this.conf?.PREFIX_KEY}:${this.module}:${key}`;
  }
}
