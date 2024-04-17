import { RequestHandler, Router } from 'express';

import { Logger } from '../../../../config/logger.config';
import { instanceNameSchema, websocketSchema } from '../../../../validate/validate.schema';
import { RouterBroker } from '../../../abstract/abstract.router';
import { InstanceDto } from '../../../dto/instance.dto';
import { HttpStatus } from '../../../routes/index.router';
import { websocketController } from '../../../server.module';
import { WebsocketDto } from '../dto/websocket.dto';

const logger = new Logger('WebsocketRouter');

export class WebsocketRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        logger.verbose('request received in setWebsocket');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<WebsocketDto>({
          request: req,
          schema: websocketSchema,
          ClassRef: WebsocketDto,
          execute: (instance, data) => websocketController.createWebsocket(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        logger.verbose('request received in findWebsocket');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceNameSchema,
          ClassRef: InstanceDto,
          execute: (instance) => websocketController.findWebsocket(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
