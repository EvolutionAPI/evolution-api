import { Router } from 'express';

import { EvoHubControlPlaneRouter } from './evohub/evohub.controlplane.router';
import { EvoHubRouter } from './evohub/evohub.router';
import { EvolutionRouter } from './evolution/evolution.router';
import { MetaRouter } from './meta/meta.router';
import { BaileysRouter } from './whatsapp/baileys.router';

export class ChannelRouter {
  public readonly router: Router;

  constructor(configService: any, ...guards: any[]) {
    this.router = Router();

    this.router.use('/', new EvolutionRouter(configService).router);
    this.router.use('/', new MetaRouter(configService).router);
    this.router.use('/', new EvoHubRouter(configService).router);
    this.router.use('/', new EvoHubControlPlaneRouter(configService).router);
    this.router.use('/baileys', new BaileysRouter(...guards).router);
  }
}
