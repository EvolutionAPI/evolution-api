import { RouterBroker } from '@api/abstract/abstract.router';
import { NumberDto } from '@api/dto/chat.dto';
import { businessController } from '@api/server.module';
import { catalogSchema, collectionsSchema } from '@validate/validate.schema';
import { RequestHandler, Router } from 'express';

import { HttpStatus } from './index.router';

export class BusinessRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('getCatalog'), ...guards, async (req, res) => {
        const response = await this.dataValidate<NumberDto>({
          request: req,
          schema: catalogSchema,
          ClassRef: NumberDto,
          execute: (instance, data) => businessController.fetchCatalog(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      })

      .post(this.routerPath('getCollections'), ...guards, async (req, res) => {
        const response = await this.dataValidate<NumberDto>({
          request: req,
          schema: collectionsSchema,
          ClassRef: NumberDto,
          execute: (instance, data) => businessController.fetchCollections(instance, data),
        });

        return res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
