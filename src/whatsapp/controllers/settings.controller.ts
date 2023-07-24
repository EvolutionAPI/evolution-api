import { isURL } from 'class-validator';
import { BadRequestException } from '../../exceptions';
import { InstanceDto } from '../dto/instance.dto';
import { SettingsDto } from '../dto/settings.dto';
import { SettingsService } from '../services/settings.service';
import { Logger } from '../../config/logger.config';

const logger = new Logger('SettingsController');

export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  public async createSettings(instance: InstanceDto, data: SettingsDto) {
    logger.verbose(
      'requested createSettings from ' + instance.instanceName + ' instance',
    );

    if (data.reject_call && data.msg_call.trim() == '') {
      throw new BadRequestException('msg_call is required');
    }

    return this.settingsService.create(instance, data);
  }

  public async findSettings(instance: InstanceDto) {
    logger.verbose('requested findSettings from ' + instance.instanceName + ' instance');
    return this.settingsService.find(instance);
  }
}
