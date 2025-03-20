import { InstanceDto } from '@api/dto/instance.dto';
import { ProviderFiles } from '@api/provider/sessions';
import { PrismaRepository } from '@api/repository/repository.service';
import { CacheService } from '@api/services/cache.service';
import { WAMonitoringService } from '@api/services/monitor.service';
import { Integration } from '@api/types/wa.types';
import { ConfigService } from '@config/env.config';
import { BadRequestException } from '@exceptions';
import EventEmitter2 from 'eventemitter2';

import { EvolutionStartupService } from './evolution/evolution.channel.service';
import { BusinessStartupService } from './meta/whatsapp.business.service';
import { BaileysStartupService } from './whatsapp/whatsapp.baileys.service';

type ChannelDataType = {
  configService: ConfigService;
  eventEmitter: EventEmitter2;
  prismaRepository: PrismaRepository;
  cache: CacheService;
  chatwootCache: CacheService;
  baileysCache: CacheService;
  providerFiles: ProviderFiles;
};

export interface ChannelControllerInterface {
  receiveWebhook(data: any): Promise<any>;
}

export class ChannelController {
  public prismaRepository: PrismaRepository;
  public waMonitor: WAMonitoringService;

  constructor(prismaRepository: PrismaRepository, waMonitor: WAMonitoringService) {
    this.prisma = prismaRepository;
    this.monitor = waMonitor;
  }

  public set prisma(prisma: PrismaRepository) {
    this.prismaRepository = prisma;
  }

  public get prisma() {
    return this.prismaRepository;
  }

  public set monitor(waMonitor: WAMonitoringService) {
    this.waMonitor = waMonitor;
  }

  public get monitor() {
    return this.waMonitor;
  }

  public init(instanceData: InstanceDto, data: ChannelDataType) {
    if (!instanceData.token && instanceData.integration === Integration.WHATSAPP_BUSINESS) {
      throw new BadRequestException('token is required');
    }

    if (instanceData.integration === Integration.WHATSAPP_BUSINESS) {
      return new BusinessStartupService(
        data.configService,
        data.eventEmitter,
        data.prismaRepository,
        data.cache,
        data.chatwootCache,
        data.baileysCache,
        data.providerFiles,
      );
    }

    if (instanceData.integration === Integration.EVOLUTION) {
      return new EvolutionStartupService(
        data.configService,
        data.eventEmitter,
        data.prismaRepository,
        data.cache,
        data.chatwootCache,
      );
    }

    if (instanceData.integration === Integration.WHATSAPP_BAILEYS) {
      return new BaileysStartupService(
        data.configService,
        data.eventEmitter,
        data.prismaRepository,
        data.cache,
        data.chatwootCache,
        data.baileysCache,
        data.providerFiles,
      );
    }

    return null;
  }
}
