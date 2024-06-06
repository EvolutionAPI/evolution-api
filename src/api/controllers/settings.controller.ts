import { InstanceDto } from '../dto/instance.dto';
import { SettingsDto } from '../dto/settings.dto';
import { SettingsService } from '../services/settings.service';

export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  public async createSettings(instance: InstanceDto, data: SettingsDto) {
    return this.settingsService.create(instance, data);
  }

  public async findSettings(instance: InstanceDto) {
    const settings = this.settingsService.find(instance);
    return settings;
  }
}
