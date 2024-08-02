import { configService, Openai } from '../../../../config/env.config';
import { BadRequestException } from '../../../../exceptions';
import { InstanceDto } from '../../../dto/instance.dto';
import { OpenaiCredsDto, OpenaiDto, OpenaiIgnoreJidDto } from '../dto/openai.dto';
import { OpenaiService } from '../services/openai.service';

export class OpenaiController {
  constructor(private readonly openaiService: OpenaiService) {}

  public async createOpenaiCreds(instance: InstanceDto, data: OpenaiCredsDto) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.createCreds(instance, data);
  }

  public async findOpenaiCreds(instance: InstanceDto) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.findCreds(instance);
  }

  public async deleteCreds(instance: InstanceDto, openaiCredsId: string) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.deleteCreds(instance, openaiCredsId);
  }

  public async createOpenai(instance: InstanceDto, data: OpenaiDto) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.create(instance, data);
  }

  public async findOpenai(instance: InstanceDto) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.find(instance);
  }

  public async fetchOpenai(instance: InstanceDto, openaiBotId: string) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.fetch(instance, openaiBotId);
  }

  public async updateOpenai(instance: InstanceDto, openaiBotId: string, data: OpenaiDto) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.update(instance, openaiBotId, data);
  }

  public async deleteOpenai(instance: InstanceDto, openaiBotId: string) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.delete(instance, openaiBotId);
  }

  public async settings(instance: InstanceDto, data: any) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.setDefaultSettings(instance, data);
  }

  public async fetchSettings(instance: InstanceDto) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.fetchDefaultSettings(instance);
  }

  public async changeStatus(instance: InstanceDto, data: any) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.changeStatus(instance, data);
  }

  public async fetchSessions(instance: InstanceDto, openaiBotId: string) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.fetchSessions(instance, openaiBotId);
  }

  public async getModels(instance: InstanceDto) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.getModels(instance);
  }

  public async ignoreJid(instance: InstanceDto, data: OpenaiIgnoreJidDto) {
    if (!configService.get<Openai>('OPENAI').ENABLED) throw new BadRequestException('Openai is disabled');

    return this.openaiService.ignoreJid(instance, data);
  }
}
