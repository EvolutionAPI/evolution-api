import { Logger } from '../../../../config/logger.config';
import { InstanceDto } from '../../../dto/instance.dto';
import { ChamaaiDto } from '../dto/chamaai.dto';
import { ChamaaiService } from '../services/chamaai.service';

const logger = new Logger('ChamaaiController');

export class ChamaaiController {
  constructor(private readonly chamaaiService: ChamaaiService) {}

  public async createChamaai(instance: InstanceDto, data: ChamaaiDto) {
    logger.verbose('requested createChamaai from ' + instance.instanceName + ' instance');

    if (!data.enabled) {
      logger.verbose('chamaai disabled');
      data.url = '';
      data.token = '';
      data.waNumber = '';
      data.answerByAudio = false;
    }

    return this.chamaaiService.create(instance, data);
  }

  public async findChamaai(instance: InstanceDto) {
    logger.verbose('requested findChamaai from ' + instance.instanceName + ' instance');
    return this.chamaaiService.find(instance);
  }
}
