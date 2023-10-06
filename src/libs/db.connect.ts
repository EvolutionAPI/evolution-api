import mongoose from 'mongoose';

import { configService, Database } from '../config/env.config';
import { Logger } from '../config/logger.config';

/**
 * Object for logging MongoDB-related messages.
 * @type {Logger}
 */
const logger = new Logger('MongoDB');

/**
 * Database settings retrieved from the configuration file.
 * @type {Database}
 */
const db = configService.get<Database>('DATABASE');

/**
 * Function that creates and returns a connection to MongoDB using Mongoose.
 * @returns {mongoose.Connection | undefined} MongoDB connection or `undefined` if the connection is not enabled.
 */
export const dbserver = (() => {
  if (db.ENABLED) {
    /**
     * Log message indicating an attempt to connect to MongoDB.
     */
    logger.verbose('connecting');

    /**
     * Options for the MongoDB connection.
     * @type {mongoose.ConnectionOptions}
     */
    const connectionOptions = {
      dbName: db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api',
    };

    /**
     * Creation of the MongoDB connection.
     * @type {mongoose.Connection}
     */
    const dbs = mongoose.createConnection(db.CONNECTION.URI, connectionOptions);

    /**
     * Log message indicating the successful connection to MongoDB.
     */
    logger.verbose('connected in ' + db.CONNECTION.URI);

    /**
     * Informative log message about the connected database name.
     */
    logger.info('ON - dbName: ' + dbs['$dbName']);

    /**
     * Registers an event handler for the beforeExit process event.
     */
    process.on('beforeExit', () => {
      /**
       * Log message indicating the destruction of the MongoDB connection instance.
       */
      logger.verbose('instance destroyed');

      /**
       * Destroys the MongoDB connection.
       * @param {boolean} [force=false] - Indicates whether the destruction should be forced.
       * @param {function(Error)} [callback] - Callback function to handle errors during destruction.
       */
      dbserver.destroy(true, (error) => logger.error(error));
    });

    /**
     * Returns the MongoDB connection.
     */
    return dbs;
  }
})();
