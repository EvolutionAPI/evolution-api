import { RequestHandler, Router } from 'express';

import { RouterBroker } from '../abstract/abstract.router';
import { viewsController } from '../whatsapp.module';

export class ViewsRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();

    this.router.get(this.routerPath('qrcode'), ...guards, (req, res) => {
      return viewsController.qrcode(req, res);
    });
  }

  public readonly router = Router();
}
