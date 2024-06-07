import { RequestHandler, Router } from 'express';

import { instanceSchema, settingsSchema } from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import { InstanceDto } from '../dto/instance.dto';
import { SettingsDto } from '../dto/settings.dto';
import { settingsController } from '../server.module';
import { HttpStatus } from './index.router';

export class SettingsRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        const response = await this.dataValidate<SettingsDto>({
          request: req,
          schema: settingsSchema,
          ClassRef: SettingsDto,
          execute: (instance, data) => settingsController.createSettings(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceSchema,
          ClassRef: InstanceDto,
          execute: (instance) => settingsController.findSettings(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
