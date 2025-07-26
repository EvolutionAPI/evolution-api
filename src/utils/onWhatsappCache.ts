import { prismaRepository } from '@api/server.module';
import { configService, Database } from '@config/env.config';
import dayjs from 'dayjs';

function getAvailableNumbers(remoteJid: string) {
  const numbersAvailable: string[] = [];

  if (remoteJid.startsWith('+')) {
    remoteJid = remoteJid.slice(1);
  }

  const [number, domain] = remoteJid.split('@');

  // Brazilian numbers - prioritize format with 9
  if (remoteJid.startsWith('55')) {
    const numberWithDigit =
      number.slice(4, 5) === '9' && number.length === 13 ? number : `${number.slice(0, 4)}9${number.slice(4)}`;
    const numberWithoutDigit = number.length === 12 ? number : number.slice(0, 4) + number.slice(5);

    // Add the format WITH 9 first (prioritized)
    numbersAvailable.push(`${numberWithDigit}@${domain || 's.whatsapp.net'}`);
    // Add the format WITHOUT 9 second (fallback)
    numbersAvailable.push(`${numberWithoutDigit}@${domain || 's.whatsapp.net'}`);
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

    numbersAvailable.push(`${numberWithDigit}@${domain || 's.whatsapp.net'}`);
    numbersAvailable.push(`${numberWithoutDigit}@${domain || 's.whatsapp.net'}`);
  }

  // Other countries
  else {
    numbersAvailable.push(remoteJid);
  }

  return numbersAvailable;
}

interface ISaveOnWhatsappCacheParams {
  remoteJid: string;
  lid?: string;
}

export async function saveOnWhatsappCache(data: ISaveOnWhatsappCacheParams[]) {
  if (configService.get<Database>('DATABASE').SAVE_DATA.IS_ON_WHATSAPP) {
    const upsertsQuery = data.map((item) => {
      const remoteJid = item.remoteJid.startsWith('+') ? item.remoteJid.slice(1) : item.remoteJid;
      const numbersAvailable = getAvailableNumbers(remoteJid);

      return prismaRepository.isOnWhatsapp.upsert({
        create: {
          remoteJid: remoteJid,
          jidOptions: numbersAvailable.join(','),
          lid: item.lid,
        },
        update: {
          jidOptions: numbersAvailable.join(','),
          lid: item.lid,
        },
        where: { remoteJid: remoteJid },
      });
    });

    await prismaRepository.$transaction(upsertsQuery);
  }
}

export async function getOnWhatsappCache(remoteJids: string[]) {
  let results: {
    remoteJid: string;
    number: string;
    jidOptions: string[];
    lid?: string;
  }[] = [];

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

    results = onWhatsappCache.map((item) => ({
      remoteJid: item.remoteJid,
      number: item.remoteJid.split('@')[0],
      jidOptions: item.jidOptions.split(','),
      lid: item.lid,
    }));
  }

  return results;
}
