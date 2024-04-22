import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { SettingsDto } from '../dto/settings.dto';
import { SettingsService } from '../services/settings.service';

const logger = new Logger('SettingsController');

export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  public async createSettings(instance: InstanceDto, data: SettingsDto) {
    logger.verbose('requested createSettings from ' + instance.instanceName + ' instance');

    return this.settingsService.create(instance, data);
  }

  public async findSettings(instance: InstanceDto) {
    logger.verbose('requested findSettings from ' + instance.instanceName + ' instance');
    const settings = this.settingsService.find(instance);
    return settings;
  }
}
