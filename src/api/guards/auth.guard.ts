import { NextFunction, Request, Response } from 'express';

import { Auth, configService, Database } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { ForbiddenException, UnauthorizedException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
import { prismaRepository } from '../server.module';

const logger = new Logger('GUARD');

async function apikey(req: Request, _: Response, next: NextFunction) {
  const env = configService.get<Auth>('AUTHENTICATION').API_KEY;
  const key = req.get('apikey');
  const db = configService.get<Database>('DATABASE');

  if (!key) {
    throw new UnauthorizedException();
  }

  if (env.KEY === key) {
    return next();
  }

  if ((req.originalUrl.includes('/instance/create') || req.originalUrl.includes('/instance/fetchInstances')) && !key) {
    throw new ForbiddenException('Missing global api key', 'The global api key must be set');
  }
  const param = req.params as unknown as InstanceDto;

  try {
    if (param?.instanceName) {
      const instance = await prismaRepository.instance.findUnique({
        where: { name: param.instanceName },
        include: { Auth: true },
      });
      if (instance.Auth?.apikey === key) {
        return next();
      }
    } else {
      if (req.originalUrl.includes('/instance/fetchInstances') && db.ENABLED) {
        const instanceByKey = await prismaRepository.auth.findFirst({
          where: { apikey: key },
        });
        if (instanceByKey) {
          return next();
        }
      }
    }
  } catch (error) {
    logger.error(error);
  }

  throw new UnauthorizedException();
}

export const authGuard = { apikey };
