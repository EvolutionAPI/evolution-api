import { createClient, RedisClientType } from '@redis/client';
import { BufferJSON } from '@whiskeysockets/baileys';

import { Redis } from '../config/env.config';
import { Logger } from '../config/logger.config';

/**
 * Class representing a Redis cache.
 */
export class RedisCache {
  /**
   * Disconnects from the Redis server.
   */
  async disconnect() {
    await this.client.disconnect();
    this.statusConnection = false;
  }

  /**
   * Creates a new instance of RedisCache.
   */
  constructor() {
    this.logger.verbose('instance created');

    process.on('beforeExit', async () => {
      this.logger.verbose('instance destroyed');
      if (this.statusConnection) {
        this.logger.verbose('instance disconnect');
        await this.client.disconnect();
      }
    });
  }

  private statusConnection = false;
  private instanceName: string;
  private redisEnv: Redis;

  /**
   * Sets the reference for the Redis instance.
   * @param {string} reference - The reference to set.
   */
  public set reference(reference: string) {
    this.logger.verbose('set reference: ' + reference);
    this.instanceName = reference;
  }

  /**
   * Connects to the Redis server.
   * @param {Redis} redisEnv - The Redis configuration.
   */
  public async connect(redisEnv: Redis) {
    this.logger.verbose('connecting');
    this.client = createClient({ url: redisEnv.URI });
    this.logger.verbose('connected in ' + redisEnv.URI);
    await this.client.connect();
    this.statusConnection = true;
    this.redisEnv = redisEnv;
  }

  private readonly logger = new Logger(RedisCache.name);
  private client: RedisClientType;

  /**
   * Retrieves keys for the Redis instance.
   * @returns {Promise<string[]>} An array of keys.
   */
  public async instanceKeys(): Promise<string[]> {
    try {
      this.logger.verbose('instance keys: ' + this.redisEnv.PREFIX_KEY + ':*');
      return await this.client.sendCommand(['keys', this.redisEnv.PREFIX_KEY + ':*']);
    } catch (error) {
      this.logger.error(error);
    }
  }

  /**
   * Checks if a specific key exists.
   * @param {string} key - The key to check.
   * @returns {Promise<boolean>} `true` if the key exists, otherwise `false`.
   */
  public async keyExists(key?: string) {
    if (key) {
      this.logger.verbose('keyExists: ' + key);
      return !!(await this.instanceKeys()).find((i) => i === key);
    }
    this.logger.verbose('keyExists: ' + this.instanceName);
    return !!(await this.instanceKeys()).find((i) => i === this.instanceName);
  }

  /**
   * Writes data to Redis cache.
   * @param {string} field - The field to write data to.
   * @param {any} data - The data to write.
   * @returns {Promise<boolean>} `true` if the write is successful, otherwise `false`.
   */
  public async writeData(field: string, data: any) {
    try {
      this.logger.verbose('writeData: ' + field);
      const json = JSON.stringify(data, BufferJSON.replacer);

      return await this.client.hSet(this.redisEnv.PREFIX_KEY + ':' + this.instanceName, field, json);
    } catch (error) {
      this.logger.error(error);
    }
  }

  /**
   * Reads data from Redis cache.
   * @param {string} field - The field to read data from.
   * @returns {Promise<any | null>} The data if found, otherwise `null`.
   */
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

  /**
   * Removes data from Redis cache.
   * @param {string} field - The field to remove data from.
   * @returns {Promise<boolean>} `true` if the removal is successful, otherwise `false`.
   */
  public async removeData(field: string) {
    try {
      this.logger.verbose('removeData: ' + field);
      return await this.client.hDel(this.redisEnv.PREFIX_KEY + ':' + this.instanceName, field);
    } catch (error) {
      this.logger.error(error);
    }
  }

  /**
   * Deletes all data associated with the Redis instance.
   * @param {string} hash - The hash to delete, defaults to the instance name.
   * @returns {Promise<boolean>} `true` if the deletion is successful, otherwise `false`.
   */
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
