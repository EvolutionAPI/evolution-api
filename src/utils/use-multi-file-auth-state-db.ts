import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';

import { configService, Database } from '../config/env.config';
import { Logger } from '../config/logger.config';
import { dbserver } from '../libs/db.connect';

/**
 * Provides a function to handle AuthenticationState and credentials using a MongoDB collection.
 * @param {string} coll - The name of the MongoDB collection.
 * @returns {Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }>} An object with AuthenticationState and saveCreds function.
 */
export async function useMultiFileAuthStateDb(
  coll: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const logger = new Logger(useMultiFileAuthStateDb.name);

  // Get the MongoDB client from the database server connection.
  const client = dbserver.getClient();

  // Construct the collection name based on the database prefix.
  const collection = client
    .db(configService.get<Database>('DATABASE').CONNECTION.DB_PREFIX_NAME + '-instances')
    .collection(coll);

  // Helper function to write data to the MongoDB collection.
  const writeData = async (data: any, key: string): Promise<any> => {
    try {
      await client.connect();
      return await collection.replaceOne({ _id: key }, JSON.parse(JSON.stringify(data, BufferJSON.replacer)), {
        upsert: true,
      });
    } catch (error) {
      logger.error(error);
    }
  };

  // Helper function to read data from the MongoDB collection.
  const readData = async (key: string): Promise<any> => {
    try {
      await client.connect();
      const data = await collection.findOne({ _id: key });
      const creds = JSON.stringify(data);
      return JSON.parse(creds, BufferJSON.reviver);
    } catch (error) {
      logger.error(error);
    }
  };

  // Helper function to remove data from the MongoDB collection.
  const removeData = async (key: string) => {
    try {
      await client.connect();
      return await collection.deleteOne({ _id: key });
    } catch (error) {
      logger.error(error);
    }
  };

  // Initialize AuthenticationCreds using stored or default values.
  const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids: string[]) => {
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
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }

          await Promise.all(tasks);
        },
      },
    },
    // Save the credentials to the MongoDB collection.
    saveCreds: async () => {
      return writeData(creds, 'creds');
    },
  };
}
