import { InstanceDto } from '@api/dto/instance.dto';
import { SettingsDto } from '@api/dto/settings.dto';
import { SettingsService } from '@api/services/settings.service';

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
