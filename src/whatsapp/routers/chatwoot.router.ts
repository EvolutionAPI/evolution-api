import { RequestHandler, Router } from 'express';

import { Logger } from '../../config/logger.config';
import { chatwootSchema, instanceNameSchema } from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import { ChatwootDto } from '../dto/chatwoot.dto';
import { InstanceDto } from '../dto/instance.dto';
// import { ChatwootService } from '../services/chatwoot.service';
import { chatwootController } from '../whatsapp.module';
import { HttpStatus } from './index.router';

const logger = new Logger('ChatwootRouter');

export class ChatwootRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        logger.verbose('request received in setChatwoot');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<ChatwootDto>({
          request: req,
          schema: chatwootSchema,
          ClassRef: ChatwootDto,
          execute: (instance, data) => chatwootController.createChatwoot(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        logger.verbose('request received in findChatwoot');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceNameSchema,
          ClassRef: InstanceDto,
          execute: (instance) => chatwootController.findChatwoot(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('webhook'), async (req, res) => {
        logger.verbose('request received in findChatwoot');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceNameSchema,
          ClassRef: InstanceDto,
          execute: (instance, data) => chatwootController.receiveWebhook(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
