import { RequestHandler, Router } from 'express';

import {
  instanceSchema,
  typebotSchema,
  typebotStartSchema,
  typebotStatusSchema,
} from '../../../../validate/validate.schema';
import { RouterBroker } from '../../../abstract/abstract.router';
import { InstanceDto } from '../../../dto/instance.dto';
import { HttpStatus } from '../../../routes/index.router';
import { typebotController } from '../../../server.module';
import { TypebotDto } from '../dto/typebot.dto';

export class TypebotRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        const response = await this.dataValidate<TypebotDto>({
          request: req,
          schema: typebotSchema,
          ClassRef: TypebotDto,
          execute: (instance, data) => typebotController.createTypebot(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => typebotController.findTypebot(instance),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('changeStatus'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: typebotStatusSchema,
          ClassRef: InstanceDto,
          execute: (instance, data) => typebotController.changeStatus(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('start'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: typebotStartSchema,
          ClassRef: InstanceDto,
          execute: (instance, data) => typebotController.startTypebot(instance, data),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
