import { configService, Database } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { PrismaClient } from '@prisma/client';

const logger = new Logger('Prisma');

const db = configService.get<Database>('DATABASE');

export const prismaServer = (() => {
  if (db.ENABLED) {
    logger.verbose('connecting');
    const db = new PrismaClient();

    process.on('beforeExit', () => {
      logger.verbose('instance destroyed');
      db.$disconnect();
    });

    return db;
  }
})();
