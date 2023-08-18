import 'express-async-errors';

import compression from 'compression';
import cors from 'cors';
import express, { json, NextFunction, Request, Response, urlencoded } from 'express';
import { join } from 'path';

import { configService, Cors, HttpServer, Rabbitmq } from './config/env.config';
import { onUnexpectedError } from './config/error.config';
import { Logger } from './config/logger.config';
import { ROOT_DIR } from './config/path.config';
import { initAMQP } from './libs/amqp.server';
import { initIO } from './libs/socket.server';
import { ServerUP } from './utils/server-up';
import { HttpStatus, router } from './whatsapp/routers/index.router';
import { waMonitor } from './whatsapp/whatsapp.module';

function initWA() {
  waMonitor.loadInstance();
}

function bootstrap() {
  const logger = new Logger('SERVER');
  const app = express();

  app.use(
    cors({
      origin(requestOrigin, callback) {
        const { ORIGIN } = configService.get<Cors>('CORS');
        if (ORIGIN.includes('*')) {
          return callback(null, true);
        }
        if (ORIGIN.indexOf(requestOrigin) !== -1) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      methods: [...configService.get<Cors>('CORS').METHODS],
      credentials: configService.get<Cors>('CORS').CREDENTIALS,
    }),
    urlencoded({ extended: true, limit: '136mb' }),
    json({ limit: '136mb' }),
    compression(),
  );

  app.set('view engine', 'hbs');
  app.set('views', join(ROOT_DIR, 'views'));
  app.use(express.static(join(ROOT_DIR, 'public')));

  app.use('/', router);

  app.use(
    (err: Error, req: Request, res: Response, next: NextFunction) => {
      if (err) {
        return res.status(err['status'] || 500).json({
          status: err['status'] || 500,
          error: err['error'] || 'Internal Server Error',
          response: {
            message: err['message'] || 'Internal Server Error',
          },
        });
      }

      next();
    },
    (req: Request, res: Response, next: NextFunction) => {
      const { method, url } = req;

      res.status(HttpStatus.NOT_FOUND).json({
        status: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        response: {
          message: [`Cannot ${method.toUpperCase()} ${url}`],
        },
      });

      next();
    },
  );

  const httpServer = configService.get<HttpServer>('SERVER');

  ServerUP.app = app;
  const server = ServerUP[httpServer.TYPE];

  server.listen(httpServer.PORT, () => logger.log(httpServer.TYPE.toUpperCase() + ' - ON: ' + httpServer.PORT));

  initWA();

  initIO(server);

  if (configService.get<Rabbitmq>('RABBITMQ').ENABLED) initAMQP();

  onUnexpectedError();
}

bootstrap();
