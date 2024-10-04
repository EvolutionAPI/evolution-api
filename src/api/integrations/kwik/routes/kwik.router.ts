import { RequestHandler, Router } from 'express';

import { Logger } from '../../../../config/logger.config';
import { RouterBroker } from '../../../abstract/abstract.router';
import { InstanceDto } from '../../../dto/instance.dto';
import { HttpStatus } from '../../../routes/index.router';
import { kwikController } from '../../../server.module';

const logger = new Logger('KwikRouter');

export class KwikRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router.get(this.routerPath('findChats'), ...guards, async (req, res) => {
      logger.verbose('request received in findChats');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) =>
          kwikController.fetchChats(
            instance,
            Number(req.query.limit),
            Number(req.query.skip),
            req.query.sort,
            Number(req.query.messageTimestamp),
          ),
      });

      return res.status(HttpStatus.OK).json(response);
    });
    this.router.post(this.routerPath('cleanup'), ...guards, async (req, res) => {
      logger.verbose('request received in cleanup');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) => kwikController.cleanup(instance),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.get(this.routerPath('instanceInfo'), ...guards, async (req, res) => {
      logger.verbose('request received in instanceInfo');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) => kwikController.instanceInfo(instance, Number(req.query.messageTimestamp)),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.post(this.routerPath('cleanChats'), ...guards, async (req, res) => {
      logger.verbose('request received in cleanChats');
      logger.verbose('request received in cleanChats');
      logger.verbose('request body: ');
      logger.verbose(req.body);
      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) => kwikController.cleanChats(instance),
      });

      return res.status(HttpStatus.OK).json(response);
    });

    this.router.post(this.routerPath('textSearch'), ...guards, async (req, res) => {
      logger.verbose('request received in textSearch');
      logger.verbose('request body: ');
      logger.verbose(req.body);

      logger.verbose('request query: ');
      logger.verbose(req.query);

      const response = await this.dataValidate<InstanceDto>({
        request: req,
        schema: null,
        ClassRef: InstanceDto,
        execute: (instance) => kwikController.textSearch(instance, req.body),
      });

      return res.status(HttpStatus.OK).json(response);
    });
  }

  public readonly router = Router();
}
