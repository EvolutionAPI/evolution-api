import { prismaRepository } from '@api/server.module';
import { configService, Database } from '@config/env.config';
import { Logger } from '@config/logger.config';
import dayjs from 'dayjs';

const logger = new Logger('OnWhatsappCache');

function getAvailableNumbers(remoteJid: string) {
  const numbersAvailable: string[] = [];

  if (remoteJid.startsWith('+')) {
    remoteJid = remoteJid.slice(1);
  }

  const [number, domain] = remoteJid.split('@');

  // TODO: Se já for @lid, retornar apenas ele mesmo SEM adicionar @domain novamente
  if (domain === 'lid' || domain === 'g.us') {
    return [remoteJid]; // Retorna direto para @lid e @g.us
  }

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

  // TODO: Adiciona @domain apenas para números que não são @lid
  return numbersAvailable.map((number) => `${number}@${domain}`);
}

interface ISaveOnWhatsappCacheParams {
  remoteJid: string;
  remoteJidAlt?: string;
  lid?: 'lid' | undefined;
}

export async function saveOnWhatsappCache(data: ISaveOnWhatsappCacheParams[]) {
  if (configService.get<Database>('DATABASE').SAVE_DATA.IS_ON_WHATSAPP) {
    for (const item of data) {
      const remoteJid = item.remoteJid.startsWith('+') ? item.remoteJid.slice(1) : item.remoteJid;

      // TODO: Buscar registro existente PRIMEIRO para preservar dados
      const allJids = [remoteJid];

      const altJid =
        item.remoteJidAlt && item.remoteJidAlt.includes('@lid')
          ? item.remoteJidAlt.startsWith('+')
            ? item.remoteJidAlt.slice(1)
            : item.remoteJidAlt
          : null;

      if (altJid) {
        allJids.push(altJid);
      }

      const expandedJids = allJids.flatMap((jid) => getAvailableNumbers(jid));

      const existingRecord = await prismaRepository.isOnWhatsapp.findFirst({
        where: {
          OR: expandedJids.map((jid) => ({ jidOptions: { contains: jid } })),
        },
      });

      logger.verbose(`Register exists: ${existingRecord ? existingRecord.remoteJid : 'não not found'}`);

      const finalJidOptions = [...expandedJids];

      if (existingRecord?.jidOptions) {
        const existingJids = existingRecord.jidOptions.split(',');
        // TODO: Adicionar JIDs existentes que não estão na lista atual
        existingJids.forEach((jid) => {
          if (!finalJidOptions.includes(jid)) {
            finalJidOptions.push(jid);
          }
        });
      }

      // TODO: Se tiver remoteJidAlt com @lid novo, adicionar
      if (altJid && !finalJidOptions.includes(altJid)) {
        finalJidOptions.push(altJid);
      }

      const uniqueNumbers = Array.from(new Set(finalJidOptions));

      logger.verbose(
        `Saving: remoteJid=${remoteJid}, jidOptions=${uniqueNumbers.join(',')}, lid=${item.lid === 'lid' || item.remoteJid?.includes('@lid') ? 'lid' : null}`,
      );

      if (existingRecord) {
        await prismaRepository.isOnWhatsapp.update({
          where: { id: existingRecord.id },
          data: {
            remoteJid: remoteJid,
            jidOptions: uniqueNumbers.join(','),
            lid: item.lid === 'lid' || item.remoteJid?.includes('@lid') ? 'lid' : null,
          },
        });
      } else {
        await prismaRepository.isOnWhatsapp.create({
          data: {
            remoteJid: remoteJid,
            jidOptions: uniqueNumbers.join(','),
            lid: item.lid === 'lid' || item.remoteJid?.includes('@lid') ? 'lid' : null,
          },
        });
      }
    }
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
