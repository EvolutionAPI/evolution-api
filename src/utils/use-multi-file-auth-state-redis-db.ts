import {
  AuthenticationCreds,
  AuthenticationState,
  initAuthCreds,
  proto,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';

import { Logger } from '../config/logger.config';
import { RedisCache } from '../libs/redis.client';

/**
 * Provides a function to handle AuthenticationState and credentials using a Redis cache.
 * @param {RedisCache} cache - The RedisCache instance to store and retrieve data.
 * @returns {Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }>} An object with AuthenticationState and saveCreds function.
 */
export async function useMultiFileAuthStateRedisDb(cache: RedisCache): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const logger = new Logger(useMultiFileAuthStateRedisDb.name);

  const writeData = async (data: any, key: string): Promise<any> => {
    try {
      return await cache.writeData(key, data);
    } catch (error) {
      return logger.error({ localError: 'writeData', error });
    }
  };

  const readData = async (key: string): Promise<any> => {
    try {
      return await cache.readData(key);
    } catch (error) {
      logger.error({ readData: 'readData', error });
      return;
    }
  };

  // Helper function to remove data from the Redis cache.
  const removeData = async (key: string) => {
    try {
      return await cache.removeData(key);
    } catch (error) {
      logger.error({ readData: 'removeData', error });
    }
  };

  // Initialize AuthenticationCreds using stored or default values.
  const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids: string[]) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const data: { [_: string]: SignalDataTypeMap[type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }

              data[id] = value;
            }),
          );

          return data;
        },
        set: async (data: any) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? await writeData(value, key) : await removeData(key));
            }
          }

          await Promise.all(tasks);
        },
      },
    },
    // Save the credentials to the Redis cache.
    saveCreds: async () => {
      return await writeData(creds, 'creds');
    },
  };
}
