import { Request, Response } from 'express';

import { ConfigService } from '../../config/env.config';
import { HttpStatus } from '../routers/index.router';
import { WAMonitoringService } from '../services/monitor.service';

export class ViewsController {
  constructor(private readonly waMonit: WAMonitoringService, private readonly configService: ConfigService) {}

  public async manager(request: Request, response: Response) {
    try {
      return response.status(HttpStatus.OK).render('manager');
    } catch (error) {
      console.log('ERROR: ', error);
    }
  }
}
