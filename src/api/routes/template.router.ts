import { RequestHandler, Router } from 'express';

import { ConfigService } from '../../config/env.config';
import { instanceSchema, templateSchema } from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import { InstanceDto } from '../dto/instance.dto';
import { TemplateDto } from '../dto/template.dto';
import { templateController } from '../server.module';
import { HttpStatus } from './index.router';

export class TemplateRouter extends RouterBroker {
  constructor(readonly configService: ConfigService, ...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('create'), ...guards, async (req, res) => {
        const response = await this.dataValidate<TemplateDto>({
          request: req,
          schema: templateSchema,
          ClassRef: TemplateDto,
          execute: (instance, data) => templateController.createTemplate(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => templateController.findTemplate(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
