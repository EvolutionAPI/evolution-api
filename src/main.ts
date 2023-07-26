import 'express-async-errors';

// import * as Sentry from '@sentry/node';
import compression from 'compression';
import cors from 'cors';
import express, { json, NextFunction, Request, Response, urlencoded } from 'express';
import { join } from 'path';

import { configService, Cors, HttpServer } from './config/env.config';
import { onUnexpectedError } from './config/error.config';
import { Logger } from './config/logger.config';
import { ROOT_DIR } from './config/path.config';
import { ServerUP } from './utils/server-up';
import { HttpStatus, router } from './whatsapp/routers/index.router';
import { waMonitor } from './whatsapp/whatsapp.module';

function initWA() {
  waMonitor.loadInstance();
}

function bootstrap() {
  const logger = new Logger('SERVER');
  const app = express();

  // Sentry.init({
  //   dsn: '',
  //   integrations: [
  //     // enable HTTP calls tracing
  //     new Sentry.Integrations.Http({ tracing: true }),
  //     // enable Express.js middleware tracing
  //     new Sentry.Integrations.Express({ app }),
  //     // Automatically instrument Node.js libraries and frameworks
  //     ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
  //   ],

  //   // Set tracesSampleRate to 1.0 to capture 100%
  //   // of transactions for performance monitoring.
  //   // We recommend adjusting this value in production
  //   tracesSampleRate: 1.0,
  // });

  // app.use(Sentry.Handlers.requestHandler());

  // app.use(Sentry.Handlers.tracingHandler());

  app.use(
    cors({
      origin(requestOrigin, callback) {
        const { ORIGIN } = configService.get<Cors>('CORS');
        !requestOrigin ? (requestOrigin = '*') : undefined;
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

  // app.use(Sentry.Handlers.errorHandler());

  // app.use(function onError(err, req, res, next) {
  //   res.statusCode = 500;
  //   res.end(res.sentry + '\n');
  // });

  app.use(
    (err: Error, req: Request, res: Response, next: NextFunction) => {
      if (err) {
        return res.status(err['status'] || 500).json(err);
      }
    },
    (req: Request, res: Response, next: NextFunction) => {
      const { method, url } = req;

      res.status(HttpStatus.NOT_FOUND).json({
        status: HttpStatus.NOT_FOUND,
        message: `Cannot ${method.toUpperCase()} ${url}`,
        error: 'Not Found',
      });

      next();
    },
  );

  const httpServer = configService.get<HttpServer>('SERVER');

  ServerUP.app = app;
  const server = ServerUP[httpServer.TYPE];

  server.listen(httpServer.PORT, () =>
    logger.log(httpServer.TYPE.toUpperCase() + ' - ON: ' + httpServer.PORT),
  );

  initWA();

  onUnexpectedError();
}

bootstrap();
