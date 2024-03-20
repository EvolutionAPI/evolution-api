import { Router } from 'express';

import { RouterBroker } from '../abstract/abstract.router';
import { viewsController } from '../whatsapp.module';

export class ViewsRouter extends RouterBroker {
  constructor() {
    super();

    this.router.get('/', (req, res) => {
      return viewsController.manager(req, res);
    });
  }

  public readonly router = Router();
}
