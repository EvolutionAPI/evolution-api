import { configService, Typebot } from '../../../../config/env.config';
import { BadRequestException } from '../../../../exceptions';
import { InstanceDto } from '../../../dto/instance.dto';
import { TypebotDto } from '../dto/typebot.dto';
import { TypebotService } from '../services/typebot.service';

export class TypebotController {
  constructor(private readonly typebotService: TypebotService) {}

  public async createTypebot(instance: InstanceDto, data: TypebotDto) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.create(instance, data);
  }

  public async findTypebot(instance: InstanceDto) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.find(instance);
  }

  public async fetchTypebot(instance: InstanceDto, typebotId: string) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.fetch(instance, typebotId);
  }

  public async updateTypebot(instance: InstanceDto, typebotId: string, data: TypebotDto) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.update(instance, typebotId, data);
  }

  public async deleteTypebot(instance: InstanceDto, typebotId: string) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.delete(instance, typebotId);
  }

  public async startTypebot(instance: InstanceDto, data: any) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.startTypebot(instance, data);
  }

  public async settings(instance: InstanceDto, data: any) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.setDefaultSettings(instance, data);
  }

  public async fetchSettings(instance: InstanceDto) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.fetchDefaultSettings(instance);
  }

  public async changeStatus(instance: InstanceDto, data: any) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.changeStatus(instance, data);
  }

  public async fetchSessions(instance: InstanceDto, typebotId: string) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.fetchSessions(instance, typebotId);
  }
}
