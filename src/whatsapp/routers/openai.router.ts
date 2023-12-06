import { RequestHandler, Router } from 'express';

import { Logger } from '../../config/logger.config';
import { instanceNameSchema, openaiSchema } from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import { InstanceDto } from '../dto/instance.dto';
import { OpenaiDto } from '../dto/openai.dto';
import { ContactOpenaiDto } from '../dto/contactopenai.dto';
import { openaiController } from '../whatsapp.module';
import { HttpStatus } from './index.router';

const logger = new Logger('OpenaiRouter');

export class OpenaiRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        logger.verbose('request received in setOpenai');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<OpenaiDto>({
          request: req,
          schema: openaiSchema,
          ClassRef: OpenaiDto,
          execute: (instance, data) => openaiController.createOpenai(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        logger.verbose('request received in findOpenai');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceNameSchema,
          ClassRef: InstanceDto,
          execute: (instance) => openaiController.findOpenai(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('contact'), ...guards, async (req, res) => {
        logger.verbose('request received in setOpenai');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<ContactOpenaiDto>({
          request: req,
          schema: openaiSchema,
          ClassRef: ContactOpenaiDto,
          execute: (instance, data) => openaiController.createContactOpenai(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      
      .get(this.routerPath('findcontact'), ...guards, async (req, res) => {
        logger.verbose('request received in findOpenai');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceNameSchema,
          ClassRef: InstanceDto,
          execute: (instance) => openaiController.findContactOpenai(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
