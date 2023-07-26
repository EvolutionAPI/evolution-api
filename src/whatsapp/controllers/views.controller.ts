import { Request, Response } from 'express';

import { Auth, ConfigService } from '../../config/env.config';
import { BadRequestException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
import { HttpStatus } from '../routers/index.router';
import { WAMonitoringService } from '../services/monitor.service';

export class ViewsController {
  constructor(private readonly waMonit: WAMonitoringService, private readonly configService: ConfigService) {}

  public async qrcode(request: Request, response: Response) {
    try {
      const param = request.params as unknown as InstanceDto;
      const instance = this.waMonit.waInstances[param.instanceName];
      if (instance.connectionStatus.state === 'open') {
        throw new BadRequestException('The instance is already connected');
      }
      const type = this.configService.get<Auth>('AUTHENTICATION').TYPE;

      return response.status(HttpStatus.OK).render('qrcode', { type, ...param });
    } catch (error) {
      console.log('ERROR: ', error);
    }
  }
}
