import { InstanceDto } from '@api/dto/instance.dto';
import { cache, waMonitor } from '@api/server.module';
import { CacheConf, configService, Database } from '@config/env.config';
import { BadRequestException, ForbiddenException, InternalServerErrorException, NotFoundException } from '@exceptions';
import { prismaServer } from '@libs/prisma.connect';
import { NextFunction, Request, Response } from 'express';

async function getInstance(instanceName: string) {
  try {
    const db = configService.get<Database>('DATABASE');
    const cacheConf = configService.get<CacheConf>('CACHE');

    const exists = !!waMonitor.waInstances[instanceName];

    if (cacheConf.REDIS.ENABLED && cacheConf.REDIS.SAVE_INSTANCES) {
      const keyExists = await cache.has(instanceName);

      return exists || keyExists;
    }

    if (db.ENABLED) {
      const prisma = prismaServer;

      return exists || (await prisma.instance.findMany({ where: { name: instanceName } })).length > 0;
    }

    return false;
  } catch (error) {
    throw new InternalServerErrorException(error?.toString());
  }
}

export async function instanceExistsGuard(req: Request, _: Response, next: NextFunction) {
  if (req.originalUrl.includes('/instance/create') || req.originalUrl.includes('/instance/fetchInstances')) {
    return next();
  }

  const param = req.params as unknown as InstanceDto;
  if (!param?.instanceName) {
    throw new BadRequestException('"instanceName" not provided.');
  }

  if (!(await getInstance(param.instanceName))) {
    throw new NotFoundException(`The "${param.instanceName}" instance does not exist`);
  }

  next();
}

export async function instanceLoggedGuard(req: Request, _: Response, next: NextFunction) {
  if (req.originalUrl.includes('/instance/create')) {
    const instance = req.body as InstanceDto;
    if (await getInstance(instance.instanceName)) {
      throw new ForbiddenException(`This name "${instance.instanceName}" is already in use.`);
    }

    if (waMonitor.waInstances[instance.instanceName]) {
      waMonitor.waInstances[instance.instanceName]?.removeRabbitmqQueues();
      waMonitor.waInstances[instance.instanceName]?.removeSqsQueues();
      delete waMonitor.waInstances[instance.instanceName];
    }
  }

  next();
}
