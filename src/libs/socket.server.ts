import { Server } from 'http';
import { Server as SocketIO } from 'socket.io';

import { configService, Cors, Websocket } from '../config/env.config';
import { Logger } from '../config/logger.config';

// Create a logger instance specifically for socket-related logs.
const logger = new Logger('Socket');

// Declare the Socket.IO instance.
let io: SocketIO;

// Get the allowed origins from the configuration.
const corsOrigins = configService.get<Cors>('CORS').ORIGIN;

/**
 * Initialize Socket.IO with the provided HTTP server.
 * @param {Server} httpServer - The HTTP server to attach Socket.IO to.
 * @returns {SocketIO | null} The Socket.IO instance if enabled, or null if disabled.
 */
export const initIO = (httpServer: Server): SocketIO | null => {
  // Check if WebSocket is enabled in the configuration.
  if (configService.get<Websocket>('WEBSOCKET')?.ENABLED) {
    // Create a new Socket.IO instance with CORS configuration.
    io = new SocketIO(httpServer, {
      cors: {
        origin: corsOrigins,
      },
    });

    // Handle the 'connection' event when a user connects.
    io.on('connection', (socket) => {
      logger.info('User connected');

      // Handle the 'disconnect' event when a user disconnects.
      socket.on('disconnect', () => {
        logger.info('User disconnected');
      });
    });

    logger.info('Socket.io initialized');
    return io;
  }

  // WebSocket is disabled, return null.
  return null;
};

/**
 * Get the Socket.IO instance.
 * @throws {Error} Throws an error if Socket.IO is not initialized.
 * @returns {SocketIO} The initialized Socket.IO instance.
 */
export const getIO = (): SocketIO => {
  logger.verbose('Getting Socket.io');

  // If Socket.IO is not initialized, throw an error.
  if (!io) {
    logger.error('Socket.io not initialized');
    throw new Error('Socket.io not initialized');
  }

  return io;
};
