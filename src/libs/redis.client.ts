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

  public async instanceKeys(): Promise<string[]> {
    const keys: string[] = [];
    try {
      this.logger.verbose('Fetching instance keys');
      for await (const key of this.client.scanIterator({ MATCH: `${this.redisEnv.PREFIX_KEY}:*` })) {
        keys.push(key);
      }
    } catch (error) {
      this.logger.error('Error fetching instance keys ' + error);
    }
    return keys;
  }

  public async keyExists(key?: string) {
    if (key) {
      this.logger.verbose('keyExists: ' + key);
      return !!(await this.instanceKeys()).find((i) => i === key);
    }
    this.logger.verbose('keyExists: ' + this.instanceName);
    return !!(await this.instanceKeys()).find((i) => i === this.instanceName);
  }

  public async writeData(field: string, data: any) {
    try {
      this.logger.verbose('writeData: ' + field);
      const json = JSON.stringify(data, BufferJSON.replacer);

      return await this.client.hSet(this.redisEnv.PREFIX_KEY + ':' + this.instanceName, field, json);
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async readData(field: string) {
    try {
      this.logger.verbose('readData: ' + field);
      const data = await this.client.hGet(this.redisEnv.PREFIX_KEY + ':' + this.instanceName, field);

      if (data) {
        this.logger.verbose('readData: ' + field + ' success');
        return JSON.parse(data, BufferJSON.reviver);
      }

      this.logger.verbose('readData: ' + field + ' not found');
      return null;
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async removeData(field: string) {
    try {
      this.logger.verbose('removeData: ' + field);
      return await this.client.hDel(this.redisEnv.PREFIX_KEY + ':' + this.instanceName, field);
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async delAll(hash?: string) {
    try {
      this.logger.verbose('instance delAll: ' + hash);
      const result = await this.client.del(hash || this.redisEnv.PREFIX_KEY + ':' + this.instanceName);

      return result;
    } catch (error) {
      this.logger.error(error);
    }
  }
}
