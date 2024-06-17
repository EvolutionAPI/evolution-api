import { AuthenticationState, BufferJSON, initAuthCreds, WAProto as proto } from 'baileys';
import fs from 'fs/promises';
import path from 'path';

import { configService, Database } from '../config/env.config';
import { Logger } from '../config/logger.config';
import { INSTANCE_DIR } from '../config/path.config';
import { dbserver } from '../libs/db.connect';

const fixFileName = (file) => {
  if (!file) {
    return undefined;
  }
  const replacedSlash = file.replace(/\//g, '__');
  const replacedColon = replacedSlash.replace(/:/g, '-');
  return replacedColon;
};

async function fileExists(file) {
  try {
    const stat = await fs.stat(file);
    if (stat.isFile()) return true;
  } catch (error) {
    return;
  }
}

export async function useMultiFileAuthStateDb(
  coll: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const client = dbserver.getClient();

  const logger = new Logger(useMultiFileAuthStateDb.name);

  const collection = client
    .db(configService.get<Database>('DATABASE').CONNECTION.DB_PREFIX_NAME + '-instances')
    .collection(coll);

  const sessionId = coll;

  const localFolder = path.join(INSTANCE_DIR, sessionId);
  const localFile = (key: string) => path.join(localFolder, fixFileName(key) + '.json');
  await fs.mkdir(localFolder, { recursive: true });

  async function writeData(data: any, key: string): Promise<any> {
    try {
      const dataString = JSON.stringify(data, BufferJSON.replacer);

      if (key != 'creds') {
        await fs.writeFile(localFile(key), dataString);
        return;
      }
      await client.connect();
      let msgParsed = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
      if (Array.isArray(msgParsed)) {
        msgParsed = {
          _id: key,
          content_array: msgParsed,
        };
      }
      return await collection.replaceOne({ _id: key }, msgParsed, {
        upsert: true,
      });
    } catch (error) {
      logger.error(error);
      return;
    }
  }

  async function readData(key: string): Promise<any> {
    try {
      if (key != 'creds') {
        if (!(await fileExists(localFile(key)))) return null;
        const rawData = await fs.readFile(localFile(key), { encoding: 'utf-8' });

        const parsedData = JSON.parse(rawData, BufferJSON.reviver);
        return parsedData;
      } else {
        await client.connect();
        let data = (await collection.findOne({ _id: key })) as any;
        if (data?.content_array) {
          data = data.content_array;
        }
        const creds = JSON.stringify(data);
        return JSON.parse(creds, BufferJSON.reviver);
      }
    } catch (error) {
      logger.error(error);
      return null;
    }
  }

  async function removeData(key: string): Promise<any> {
    try {
      if (key != 'creds') {
        await fs.unlink(localFile(key));
      } else {
        await client.connect();
        return await collection.deleteOne({ _id: key });
      }
    } catch (error) {
      logger.error(error);
      return;
    }
  }

  let creds = await readData('creds');
  if (!creds) {
    creds = initAuthCreds();
    await writeData(creds, 'creds');
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
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
        set: async (data) => {
          const tasks = [];
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
    saveCreds: () => {
      return writeData(creds, 'creds');
    },
  };
}
