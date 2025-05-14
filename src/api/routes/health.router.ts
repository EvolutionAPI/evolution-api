import { healthController } from '@api/server.module';
import { Router } from 'express';

import { RouterBroker } from '../abstract/abstract.router';
import { HttpStatus } from './index.router';

export class HealthRouter extends RouterBroker {
  constructor() {
    super();
    this.router.get(this.routerPath('healthz', false), async (req, res) => {
      await healthController.checkHealth();
      return res.status(HttpStatus.OK).json({ msg: 'healthy' });
    });
  }

  public readonly router: Router = Router();
}
