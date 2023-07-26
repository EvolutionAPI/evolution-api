import mongoose from 'mongoose';

import { configService, Database } from '../config/env.config';
import { Logger } from '../config/logger.config';

const logger = new Logger('MongoDB');

const db = configService.get<Database>('DATABASE');
export const dbserver = (() => {
  if (db.ENABLED) {
    logger.verbose('connecting');
    const dbs = mongoose.createConnection(db.CONNECTION.URI, {
      dbName: db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api',
    });
    logger.verbose('connected in ' + db.CONNECTION.URI);
    logger.info('ON - dbName: ' + dbs['$dbName']);

    process.on('beforeExit', () => {
      logger.verbose('instance destroyed');
      dbserver.destroy(true, (error) => logger.error(error));
    });

    return dbs;
  }
})();
