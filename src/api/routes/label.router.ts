import { RequestHandler, Router } from 'express';

import { handleLabelSchema } from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import { HandleLabelDto, LabelDto } from '../dto/label.dto';
import { labelController } from '../server.module';
import { HttpStatus } from './index.router';

export class LabelRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .get(this.routerPath('findLabels'), ...guards, async (req, res) => {
        const response = await this.dataValidate<LabelDto>({
          request: req,
          schema: null,
          ClassRef: LabelDto,
          execute: (instance) => labelController.fetchLabels(instance),
        });

        return res.status(HttpStatus.OK).json(response);
      })
      .post(this.routerPath('handleLabel'), ...guards, async (req, res) => {
        const response = await this.dataValidate<HandleLabelDto>({
          request: req,
          schema: handleLabelSchema,
          ClassRef: HandleLabelDto,
          execute: (instance, data) => labelController.handleLabel(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
