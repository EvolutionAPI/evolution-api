import { InstanceDto } from '@api/dto/instance.dto';
import { prismaRepository } from '@api/server.module';
import { Auth, configService, Database } from '@config/env.config';
import { Logger } from '@config/logger.config';
import { ForbiddenException, UnauthorizedException } from '@exceptions';
import { NextFunction, Request, Response } from 'express';

const logger = new Logger('GUARD');

async function apikey(req: Request, _: Response, next: NextFunction) {
  const env = configService.get<Auth>('AUTHENTICATION').API_KEY;
  const key = req.get('apikey');
  const db = configService.get<Database>('DATABASE');

  if (!key) {
    throw new UnauthorizedException('API key is missing');
  }

  if (env.KEY === key) {
    return next();
  }

  const isInstanceCreation = req.originalUrl.includes('/instance/create');
  const isFetchInstances = req.originalUrl.includes('/instance/fetchInstances');

  if (isInstanceCreation || isFetchInstances) {
    if (db.SAVE_DATA.INSTANCE) {
      const instanceByKey = await prismaRepository.instance.findFirst({
        where: { token: key },
      });
      if (instanceByKey) {
        return next();
      }
    }
    
    if (isInstanceCreation) {
      throw new ForbiddenException('Invalid API key for instance creation', 'The provided API key is not authorized to create instances');
    }
  }

  const param = req.params as unknown as InstanceDto;

  try {
    if (param?.instanceName) {
      const instance = await prismaRepository.instance.findUnique({
        where: { name: param.instanceName },
      });
      if (instance && instance.token === key) {
        return next();
      }
    }
  } catch (error) {
    logger.error(error);
  }

  throw new UnauthorizedException('Invalid API key');
}

export const authGuard = { apikey };
