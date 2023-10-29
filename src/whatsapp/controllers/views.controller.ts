import { Request, Response } from 'express';

import { Auth, ConfigService, HttpServer } from '../../config/env.config';
import { HttpStatus } from '../routers/index.router';
import { WAMonitoringService } from '../services/monitor.service';

export class ViewsController {
  constructor(private readonly waMonitor: WAMonitoringService, private readonly configService: ConfigService) {}

  public async manager(request: Request, response: Response) {
    try {
      const token = this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY;
      const port = this.configService.get<HttpServer>('SERVER').PORT;

      const instances = await this.waMonitor.instanceInfo();

      console.log('INSTANCES: ', instances);
      return response.status(HttpStatus.OK).render('manager', { token, port, instances });
    } catch (error) {
      console.log('ERROR: ', error);
    }
  }
}
