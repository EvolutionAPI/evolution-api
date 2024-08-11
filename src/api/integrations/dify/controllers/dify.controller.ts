import { InstanceDto } from '@api/dto/instance.dto';
import { DifyDto, DifyIgnoreJidDto } from '@api/integrations/dify/dto/dify.dto';
import { DifyService } from '@api/integrations/dify/services/dify.service';
import { configService, Dify } from '@config/env.config';
import { BadRequestException } from '@exceptions';

export class DifyController {
  constructor(private readonly difyService: DifyService) {}

  public async createDify(instance: InstanceDto, data: DifyDto) {
    if (!configService.get<Dify>('DIFY').ENABLED) throw new BadRequestException('Dify is disabled');

    return this.difyService.create(instance, data);
  }

  public async findDify(instance: InstanceDto) {
    if (!configService.get<Dify>('DIFY').ENABLED) throw new BadRequestException('Dify is disabled');

    return this.difyService.find(instance);
  }

  public async fetchDify(instance: InstanceDto, difyId: string) {
    if (!configService.get<Dify>('DIFY').ENABLED) throw new BadRequestException('Dify is disabled');

    return this.difyService.fetch(instance, difyId);
  }

  public async updateDify(instance: InstanceDto, difyId: string, data: DifyDto) {
    if (!configService.get<Dify>('DIFY').ENABLED) throw new BadRequestException('Dify is disabled');

    return this.difyService.update(instance, difyId, data);
  }

  public async deleteDify(instance: InstanceDto, difyId: string) {
    if (!configService.get<Dify>('DIFY').ENABLED) throw new BadRequestException('Dify is disabled');

    return this.difyService.delete(instance, difyId);
  }

  public async settings(instance: InstanceDto, data: any) {
    if (!configService.get<Dify>('DIFY').ENABLED) throw new BadRequestException('Dify is disabled');

    return this.difyService.setDefaultSettings(instance, data);
  }

  public async fetchSettings(instance: InstanceDto) {
    if (!configService.get<Dify>('DIFY').ENABLED) throw new BadRequestException('Dify is disabled');

    return this.difyService.fetchDefaultSettings(instance);
  }

  public async changeStatus(instance: InstanceDto, data: any) {
    if (!configService.get<Dify>('DIFY').ENABLED) throw new BadRequestException('Dify is disabled');

    return this.difyService.changeStatus(instance, data);
  }

  public async fetchSessions(instance: InstanceDto, difyId: string) {
    if (!configService.get<Dify>('DIFY').ENABLED) throw new BadRequestException('Dify is disabled');

    return this.difyService.fetchSessions(instance, difyId);
  }

  public async ignoreJid(instance: InstanceDto, data: DifyIgnoreJidDto) {
    if (!configService.get<Dify>('DIFY').ENABLED) throw new BadRequestException('Dify is disabled');

    return this.difyService.ignoreJid(instance, data);
  }
}
