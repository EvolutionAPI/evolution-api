import { configService, Sqs } from '../../../../config/env.config';
import { BadRequestException } from '../../../../exceptions';
import { Events } from '../../../../validate/validate.schema';
import { InstanceDto } from '../../../dto/instance.dto';
import { SqsDto } from '../dto/sqs.dto';
import { SqsService } from '../services/sqs.service';

export class SqsController {
  constructor(private readonly sqsService: SqsService) {}

  public async createSqs(instance: InstanceDto, data: SqsDto) {
    if (!configService.get<Sqs>('SQS').ENABLED) throw new BadRequestException('Sqs is disabled');

    if (!data.enabled) {
      data.events = [];
    }

    if (data.events.length === 0) {
      data.events = Events;
    }

    return this.sqsService.create(instance, data);
  }

  public async findSqs(instance: InstanceDto) {
    return this.sqsService.find(instance);
  }
}
