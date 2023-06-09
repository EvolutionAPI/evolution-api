import mongoose from 'mongoose';
import { configService, Database } from '../config/env.config';
import { Logger } from '../config/logger.config';

const logger = new Logger('Db Connection');

export const db = configService.get<Database>('DATABASE');
export const dbserver = db.ENABLED
  ? mongoose.createConnection(db.CONNECTION.URI, {
      dbName: db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api',
    })
  : null;

db.ENABLED ? logger.info('ON - dbName: ' + dbserver['$dbName']) : null;
