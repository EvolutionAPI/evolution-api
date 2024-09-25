import { Logger } from '@config/logger.config';
import { PrismaClient } from '@prisma/client';

const logger = new Logger('Prisma');

export const prismaServer = (() => {
  logger.verbose('connecting');
  const db = new PrismaClient();

  process.on('beforeExit', () => {
    logger.verbose('instance destroyed');
    db.$disconnect();
  });

  return db;
})();
