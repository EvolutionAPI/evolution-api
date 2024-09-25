import { Router } from 'express';

import { EvolutionRouter } from './evolution/evolution.router';
import { MetaRouter } from './meta/meta.router';

export class ChannelRouter {
  public readonly router: Router;

  constructor(configService: any) {
    this.router = Router();

    this.router.use('/', new EvolutionRouter(configService).router);
    this.router.use('/', new MetaRouter(configService).router);
  }
}
