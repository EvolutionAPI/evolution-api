import { InstanceDto } from '@api/dto/instance.dto';
import { ProviderFiles } from '@api/provider/sessions';
import { PrismaRepository } from '@api/repository/repository.service';
import { CacheService } from '@api/services/cache.service';
import { Integration } from '@api/types/wa.types';
import { ConfigService } from '@config/env.config';
import { BadRequestException } from '@exceptions';
import EventEmitter2 from 'eventemitter2';

import { EvolutionStartupService } from './evolution/evolution.channel.service';
import { BaileysStartupService } from './whatsapp/baileys/whatsapp.baileys.service';
import { BusinessStartupService } from './whatsapp/business/whatsapp.business.service';

type ChannelDataType = {
  configService: ConfigService;
  eventEmitter: EventEmitter2;
  prismaRepository: PrismaRepository;
  cache: CacheService;
  chatwootCache: CacheService;
  baileysCache: CacheService;
  providerFiles: ProviderFiles;
};

export class ChannelController {
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
        data.baileysCache,
        data.providerFiles,
      );
    }

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
}
