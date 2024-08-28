import { cache, prismaRepository } from '@api/server.module';
import { CacheConf, configService, Database } from '@config/env.config';
import dayjs from 'dayjs';

function getAvailableNumbers(remoteJid: string) {
  const numbersAvailable: string[] = [];

  if (remoteJid.startsWith('+')) {
    remoteJid = remoteJid.slice(1);
  }

  const [number, domain] = remoteJid.split('@');

  // Brazilian numbers
  if (remoteJid.startsWith('55')) {
    const numberWithDigit =
      number.slice(4, 5) === '9' && number.length === 13 ? number : `${number.slice(0, 4)}9${number.slice(4)}`;
    const numberWithoutDigit = number.length === 12 ? number : number.slice(0, 4) + number.slice(5);

    numbersAvailable.push(numberWithDigit);
    numbersAvailable.push(numberWithoutDigit);
  }

  // Mexican/Argentina numbers
  // Ref: https://faq.whatsapp.com/1294841057948784
  else if (number.startsWith('52') || number.startsWith('54')) {
    let prefix = '';
    if (number.startsWith('52')) {
      prefix = '1';
    }
    if (number.startsWith('54')) {
      prefix = '9';
    }

    const numberWithDigit =
      number.slice(2, 3) === prefix && number.length === 13
        ? number
        : `${number.slice(0, 2)}${prefix}${number.slice(2)}`;
    const numberWithoutDigit = number.length === 12 ? number : number.slice(0, 2) + number.slice(3);

    numbersAvailable.push(numberWithDigit);
    numbersAvailable.push(numberWithoutDigit);
  }

  // Other countries
  else {
    numbersAvailable.push(remoteJid);
  }

  return numbersAvailable.map((number) => `${number}@${domain}`);
}

interface ISaveOnWhatsappCacheParams {
  remoteJid: string;
}
export async function saveOnWhatsappCache(data: ISaveOnWhatsappCacheParams[]) {
  const cacheConfig = configService.get<CacheConf>('CACHE');

  if (cacheConfig.REDIS.ENABLED && cacheConfig.REDIS.SAVE_IS_ON_WHATSAPP) {
    await Promise.all(
      data.map(async (item) => {
        const remoteJid = item.remoteJid.startsWith('+') ? item.remoteJid.slice(1) : item.remoteJid;
        const numbersAvailable = getAvailableNumbers(remoteJid);

        await cache.set(
          `isOnWhatsapp:${remoteJid}`,
          JSON.stringify({ jidOptions: numbersAvailable }),
          cacheConfig.REDIS.SAVE_IS_ON_WHATSAPP_TTL,
        );
      }),
    );
  }

  if (configService.get<Database>('DATABASE').SAVE_DATA.IS_ON_WHATSAPP) {
    const upsertsQuery = data.map((item) => {
      const remoteJid = item.remoteJid.startsWith('+') ? item.remoteJid.slice(1) : item.remoteJid;
      const numbersAvailable = getAvailableNumbers(remoteJid);

      return prismaRepository.isOnWhatsapp.upsert({
        create: { remoteJid: remoteJid, jidOptions: numbersAvailable.join(',') },
        update: { jidOptions: numbersAvailable.join(',') },
        where: { remoteJid: remoteJid },
      });
    });

    await prismaRepository.$transaction(upsertsQuery);
  }
}

export async function getOnWhatsappCache(remoteJids: string[]) {
  const cacheConfig = configService.get<CacheConf>('CACHE');

  const results: {
    remoteJid: string;
    number: string;
    jidOptions: string[];
  }[] = [];

  if (cacheConfig.REDIS.ENABLED && cacheConfig.REDIS.SAVE_IS_ON_WHATSAPP) {
    const data = await Promise.all(
      remoteJids.map(async (remoteJid) => {
        const remoteJidWithoutPlus = remoteJid.startsWith('+') ? remoteJid.slice(1) : remoteJid;
        const cacheData = await cache.get(`isOnWhatsapp:${remoteJidWithoutPlus}`);

        if (cacheData) {
          return {
            remoteJid: remoteJidWithoutPlus,
            number: remoteJidWithoutPlus.split('@')[0],
            jidOptions: JSON.parse(cacheData)?.jidOptions,
          };
        }

        return null;
      }),
    );

    data.forEach((item) => {
      if (item) {
        results.push({
          remoteJid: item.remoteJid,
          number: item.number,
          jidOptions: item.jidOptions,
        });
      }
    });
  }

  if (configService.get<Database>('DATABASE').SAVE_DATA.IS_ON_WHATSAPP) {
    const remoteJidsWithoutPlus = remoteJids.map((remoteJid) => getAvailableNumbers(remoteJid)).flat();

    const onWhatsappCache = await prismaRepository.isOnWhatsapp.findMany({
      where: {
        OR: remoteJidsWithoutPlus.map((remoteJid) => ({ jidOptions: { contains: remoteJid } })),
        updatedAt: {
          gte: dayjs().subtract(configService.get<Database>('DATABASE').SAVE_DATA.IS_ON_WHATSAPP_DAYS, 'days').toDate(),
        },
      },
    });

    onWhatsappCache.forEach((item) =>
      results.push({
        remoteJid: item.remoteJid,
        number: item.remoteJid.split('@')[0],
        jidOptions: item.jidOptions.split(','),
      }),
    );
  }

  return results;
}
