import { RequestHandler, Router } from 'express';

import { instanceSchema, proxySchema } from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import { InstanceDto } from '../dto/instance.dto';
import { ProxyDto } from '../dto/proxy.dto';
import { proxyController } from '../server.module';
import { HttpStatus } from './index.router';

export class ProxyRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        const response = await this.dataValidate<ProxyDto>({
          request: req,
          schema: proxySchema,
          ClassRef: ProxyDto,
          execute: (instance, data) => proxyController.createProxy(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => proxyController.findProxy(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
