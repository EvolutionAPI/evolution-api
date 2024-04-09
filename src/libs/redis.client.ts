import { createClient, RedisClientType } from '@redis/client';
import { BufferJSON } from '@whiskeysockets/baileys';

import { Redis } from '../config/env.config';
import { Logger } from '../config/logger.config';

export class RedisCache {
  private readonly logger = new Logger(RedisCache.name);
  private client: RedisClientType;
  private statusConnection = false;
  private instanceName: string;
  private redisEnv: Redis;

  constructor() {
    this.logger.verbose('RedisCache instance created');
    process.on('beforeExit', () => {
      this.logger.verbose('RedisCache instance destroyed');
      this.disconnect();
    });
  }

  public set reference(reference: string) {
    this.logger.verbose('set reference: ' + reference);
    this.instanceName = reference;
  }

  public async connect(redisEnv: Redis) {
    this.logger.verbose('Connecting to Redis...');
    this.client = createClient({ url: redisEnv.URI });
    this.client.on('error', (err) => this.logger.error('Redis Client Error ' + err));

    await this.client.connect();
    this.statusConnection = true;
    this.redisEnv = redisEnv;
    this.logger.verbose(`Connected to ${redisEnv.URI}`);
  }

  public async disconnect() {
    if (this.statusConnection) {
      await this.client.disconnect();
      this.statusConnection = false;
      this.logger.verbose('Redis client disconnected');
    }
  }

  public async getInstanceKeys(): Promise<string[]> {
    const keys: string[] = [];
    try {
      this.logger.verbose('Fetching instance keys');
      for await (const key of this.client.scanIterator({ MATCH: `${this.redisEnv.PREFIX_KEY}:*` })) {
        keys.push(key);
      }
      return keys;
    } catch (error) {
      this.logger.error('Error fetching instance keys ' + error);
      throw error;
    }
  }

  public async keyExists(key?: string) {
    try {
      const keys = await this.getInstanceKeys();
      const targetKey = key || this.instanceName;
      this.logger.verbose('keyExists: ' + targetKey);
      return keys.includes(targetKey);
    } catch (error) {
      return false;
    }
  }

  public async setData(field: string, data: any) {
    try {
      this.logger.verbose('setData: ' + field);
      const json = JSON.stringify(data, BufferJSON.replacer);
      await this.client.hSet(this.redisEnv.PREFIX_KEY + ':' + this.instanceName, field, json);
      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  public async getData(field: string): Promise<any | null> {
    try {
      this.logger.verbose('getData: ' + field);
      const data = await this.client.hGet(this.redisEnv.PREFIX_KEY + ':' + this.instanceName, field);

      if (data) {
        this.logger.verbose('getData: ' + field + ' success');
        return JSON.parse(data, BufferJSON.reviver);
      }

      this.logger.verbose('getData: ' + field + ' not found');
      return null;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  public async removeData(field: string): Promise<boolean> {
    try {
      this.logger.verbose('removeData: ' + field);
      await this.client.hDel(this.redisEnv.PREFIX_KEY + ':' + this.instanceName, field);
      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  public async delAll(hash?: string): Promise<boolean> {
    try {
      const targetHash = hash || this.redisEnv.PREFIX_KEY + ':' + this.instanceName;
      this.logger.verbose('instance delAll: ' + targetHash);
      const result = await this.client.del(targetHash);
      return !!result;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }
}
