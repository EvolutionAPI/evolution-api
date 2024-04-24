import { createClient, RedisClientType } from 'redis';

import { CacheConf, CacheConfRedis, configService } from '../config/env.config';
import { Logger } from '../config/logger.config';

class Redis {
  private logger = new Logger(Redis.name);
  private client: RedisClientType = null;
  private conf: CacheConfRedis;
  private connected = false;

  constructor() {
    this.conf = configService.get<CacheConf>('CACHE')?.REDIS;
  }

  getConnection(): RedisClientType {
    if (this.connected) {
      return this.client;
    } else {
      this.client = createClient({
        url: this.conf.URI,
      });

      this.client.on('connect', () => {
        this.logger.verbose('redis connecting');
      });

      this.client.on('ready', () => {
        this.logger.verbose('redis ready');
        this.connected = true;
      });

      this.client.on('error', () => {
        this.logger.error('redis disconnected');
        this.connected = false;
      });

      this.client.on('end', () => {
        this.logger.verbose('redis connection ended');
        this.connected = false;
      });

      try {
        this.logger.verbose('connecting new redis client');
        this.client.connect();
        this.connected = true;
        this.logger.verbose('connected to new redis client');
      } catch (e) {
        this.connected = false;
        this.logger.error('redis connect exception caught: ' + e);
        return null;
      }

      return this.client;
    }
  }
}

export const redisClient = new Redis();
