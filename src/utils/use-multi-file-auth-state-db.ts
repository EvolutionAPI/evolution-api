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

export async function useMultiFileAuthStateDb(
  coll: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const logger = new Logger(useMultiFileAuthStateDb.name);

  const client = dbserver.getClient();

  const collection = client
    .db(configService.get<Database>('DATABASE').CONNECTION.DB_PREFIX_NAME + '-instances')
    .collection(coll);

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

  const removeData = async (key: string) => {
    try {
      await client.connect();
      return await collection.deleteOne({ _id: key });
    } catch (error) {
      logger.error(error);
    }
  };

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
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }

          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      return writeData(creds, 'creds');
    },
  };
}
