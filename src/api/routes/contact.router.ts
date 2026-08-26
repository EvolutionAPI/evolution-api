import { RouterBroker } from '@api/abstract/abstract.router';
import { SaveContactDto } from '@api/dto/contact.dto';
import { contactController } from '@api/server.module';
import { saveContactSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

import { HttpStatus } from './index.router';

export class ContactRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router.post(this.routerPath('save'), ...guards, async (req, res) => {
      const response = await this.dataValidate<SaveContactDto>({
        request: req,
        schema: saveContactSchema,
        ClassRef: SaveContactDto,
        execute: (instance, data) => contactController.saveContact(instance, data),
      });

      return res.status(HttpStatus.CREATED).json(response);
    });
  }

  public readonly router: Router = Router();
}
