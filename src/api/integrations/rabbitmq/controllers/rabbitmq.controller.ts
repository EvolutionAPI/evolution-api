import { configService, Rabbitmq } from '../../../../config/env.config';
import { BadRequestException } from '../../../../exceptions';
import { Events } from '../../../../validate/validate.schema';
import { InstanceDto } from '../../../dto/instance.dto';
import { RabbitmqDto } from '../dto/rabbitmq.dto';
import { RabbitmqService } from '../services/rabbitmq.service';

export class RabbitmqController {
  constructor(private readonly rabbitmqService: RabbitmqService) {}

  public async createRabbitmq(instance: InstanceDto, data: RabbitmqDto) {
    if (!configService.get<Rabbitmq>('RABBITMQ').ENABLED) throw new BadRequestException('Rabbitmq is disabled');

    if (!data.enabled) {
      data.events = [];
    }

    if (data.events.length === 0) {
      data.events = Events;
    }

    return this.rabbitmqService.create(instance, data);
  }

  public async findRabbitmq(instance: InstanceDto) {
    return this.rabbitmqService.find(instance);
  }
}
