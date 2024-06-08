import { configService, Typebot } from '../../../../config/env.config';
import { BadRequestException } from '../../../../exceptions';
import { InstanceDto } from '../../../dto/instance.dto';
import { TypebotDto } from '../dto/typebot.dto';
import { TypebotService } from '../services/typebot.service';

export class TypebotController {
  constructor(private readonly typebotService: TypebotService) {}

  public async createTypebot(instance: InstanceDto, data: TypebotDto) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    if (!data.enabled) {
      data.url = '';
      data.typebot = '';
      data.expire = 0;
      data.sessions = [];
    } else {
      const saveData = await this.typebotService.find(instance);

      if (saveData?.typebot?.enabled) {
        data.sessions = saveData?.sessions;
      }
    }

    return this.typebotService.create(instance, data);
  }

  public async findTypebot(instance: InstanceDto) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.find(instance);
  }

  public async changeStatus(instance: InstanceDto, data: any) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.changeStatus(instance, data);
  }

  public async startTypebot(instance: InstanceDto, data: any) {
    if (!configService.get<Typebot>('TYPEBOT').ENABLED) throw new BadRequestException('Typebot is disabled');

    return this.typebotService.startTypebot(instance, data);
  }
}
