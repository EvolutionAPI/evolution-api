import mongoose from 'mongoose';
import { configService, Database } from '../config/env.config';
import { Logger } from '../config/logger.config';

const logger = new Logger('Db Connection');

const db = configService.get<Database>('DATABASE');
export const dbserver = (() => {
  if (db.ENABLED) {
    const dbs = mongoose.createConnection(db.CONNECTION.URI, {
      dbName: db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api',
    });
    logger.info('ON - dbName: ' + dbs['$dbName']);
    process.on('beforeExit', () => {
      dbserver.destroy(true, (error) => logger.error(error));
    });

    return dbs;
  }
})();
