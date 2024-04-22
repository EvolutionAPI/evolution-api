import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { SettingsDto } from '../dto/settings.dto';
import { WAMonitoringService } from './monitor.service';

export class SettingsService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(SettingsService.name);

  public create(instance: InstanceDto, data: SettingsDto) {
    this.logger.verbose('create settings: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setSettings(data);

    return { settings: { ...instance, settings: data } };
  }

  public async find(instance: InstanceDto): Promise<SettingsDto> {
    try {
      this.logger.verbose('find settings: ' + instance.instanceName);
      const result = await this.waMonitor.waInstances[instance.instanceName].findSettings();

      if (Object.keys(result).length === 0) {
        throw new Error('Settings not found');
      }

      return result;
    } catch (error) {
      return { reject_call: false, msg_call: '', groups_ignore: true };
    }
  }
}
