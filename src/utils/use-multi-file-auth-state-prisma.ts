import { BufferJSON, initAuthCreds, WAProto as proto } from '@whiskeysockets/baileys';
import fs from 'fs/promises';
import path from 'path';

import { INSTANCE_DIR } from '../config/path.config';
import { prismaServer } from '../libs/prisma.connect';

const prisma = prismaServer;

const fixFileName = (file) => {
  if (!file) {
    return undefined;
  }
  const replacedSlash = file.replace(/\//g, '__');
  const replacedColon = replacedSlash.replace(/:/g, '-');
  return replacedColon;
};

export async function keyExists(sessionId) {
  try {
    const key = await prisma.session.findUnique({ where: { sessionId: sessionId } });
    return !!key;
  } catch (error) {
    console.log(`${error}`);
    return false;
  }
}

export async function saveKey(sessionId, keyJson) {
  const jaExiste = await keyExists(sessionId);
  try {
    if (!jaExiste)
      return await prisma.session.create({
        data: {
          sessionId: sessionId,
          creds: JSON.stringify(keyJson),
        },
      });
    await prisma.session.update({
      where: { sessionId: sessionId },
      data: { creds: JSON.stringify(keyJson) },
    });
  } catch (error) {
    console.log(`${error}`);
    return null;
  }
}

export async function getAuthKey(sessionId) {
  try {
    const registro = await keyExists(sessionId);
    if (!registro) return null;
    const auth = await prisma.session.findUnique({ where: { sessionId: sessionId } });
    return JSON.parse(auth?.creds);
  } catch (error) {
    console.log(`${error}`);
    return null;
  }
}

async function deleteAuthKey(sessionId) {
  try {
    const registro = await keyExists(sessionId);
    if (!registro) return;
    await prisma.session.delete({ where: { sessionId: sessionId } });
  } catch (error) {
    console.log('2', `${error}`);
  }
}

async function fileExists(file) {
  try {
    const stat = await fs.stat(file);
    if (stat.isFile()) return true;
  } catch (error) {
    return;
  }
}

export default async function useMultiFileAuthStatePrisma(sessionId) {
  const localFolder = path.join(INSTANCE_DIR, sessionId);
  const localFile = (key) => path.join(localFolder, fixFileName(key) + '.json');
  await fs.mkdir(localFolder, { recursive: true });

  async function writeData(data, key) {
    const dataString = JSON.stringify(data, BufferJSON.replacer);

    if (key != 'creds') {
      await fs.writeFile(localFile(key), dataString);
      return;
    }
    await saveKey(sessionId, dataString);
    return;
  }

  async function readData(key) {
    try {
      let rawData;

      if (key != 'creds') {
        if (!(await fileExists(localFile(key)))) return null;
        rawData = await fs.readFile(localFile(key), { encoding: 'utf-8' });
      } else {
        rawData = await getAuthKey(sessionId);
      }

      const parsedData = JSON.parse(rawData, BufferJSON.reviver);
      return parsedData;
    } catch (error) {
      return null;
    }
  }

  async function removeData(key) {
    try {
      if (key != 'creds') {
        await fs.unlink(localFile(key));
      } else {
        await deleteAuthKey(sessionId);
      }
    } catch (error) {
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
