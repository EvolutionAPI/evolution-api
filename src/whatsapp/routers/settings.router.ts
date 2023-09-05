import { RequestHandler, Router } from 'express';

import { Logger } from '../../config/logger.config';
import { instanceNameSchema, settingsSchema } from '../../validate/validate.schema';
import { RouterBroker } from '../abstract/abstract.router';
import { InstanceDto } from '../dto/instance.dto';
import { SettingsDto } from '../dto/settings.dto';
// import { SettingsService } from '../services/settings.service';
import { settingsController } from '../whatsapp.module';
import { HttpStatus } from './index.router';

const logger = new Logger('SettingsRouter');

export class SettingsRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('set'), ...guards, async (req, res) => {
        logger.verbose('request received in setSettings');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<SettingsDto>({
          request: req,
          schema: settingsSchema,
          ClassRef: SettingsDto,
          execute: (instance, data) => settingsController.createSettings(instance, data),
        });

        res.status(HttpStatus.CREATED).json(response);
      })
      .get(this.routerPath('find'), ...guards, async (req, res) => {
        logger.verbose('request received in findSettings');
        logger.verbose('request body: ');
        logger.verbose(req.body);

        logger.verbose('request query: ');
        logger.verbose(req.query);
        const response = await this.dataValidate<InstanceDto>({
          request: req,
          schema: instanceNameSchema,
          ClassRef: InstanceDto,
          execute: (instance) => settingsController.findSettings(instance),
        });

        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router = Router();
}
