import { Server } from 'http';
import { Server as SocketIO } from 'socket.io';

import { configService, Cors, Websocket } from '../../../../config/env.config';
import { Logger } from '../../../../config/logger.config';

const logger = new Logger('Socket');

let io: SocketIO;

const origin = configService.get<Cors>('CORS').ORIGIN;
const methods = configService.get<Cors>('CORS').METHODS;
const credentials = configService.get<Cors>('CORS').CREDENTIALS;

export const initIO = (httpServer: Server) => {
  if (configService.get<Websocket>('WEBSOCKET')?.ENABLED) {
    io = new SocketIO(httpServer, {
      cors: {
        origin,
        methods,
        credentials,
      },
    });

    io.on('connection', (socket) => {
      logger.info('User connected');

      socket.on('disconnect', () => {
        logger.info('User disconnected');
      });
    });

    logger.info('Socket.io initialized');
    return io;
  }
  return null;
};

export const getIO = (): SocketIO => {
  logger.verbose('Getting Socket.io');

  if (!io) {
    logger.error('Socket.io not initialized');
    throw new Error('Socket.io not initialized');
  }

  return io;
};
