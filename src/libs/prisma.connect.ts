import { PrismaClient } from '@prisma/client';

import { configService, Database } from '../config/env.config';
import { Logger } from '../config/logger.config';

const logger = new Logger('MongoDB');

const db = configService.get<Database>('DATABASE');
export const prismaServer = (() => {
  if (db.ENABLED && db.PROVIDER !== 'mongodb') {
    logger.verbose('connecting');
    const db = new PrismaClient();

    logger.verbose('connected in ' + db.$connect);

    process.on('beforeExit', () => {
      logger.verbose('instance destroyed');
      db.$disconnect();
    });

    return db;
  }
})();
