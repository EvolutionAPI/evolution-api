import { configService, Database } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { dbserver } from '../../libs/db.connect';
import { InstanceDto } from '../dto/instance.dto';
import { SettingsDto } from '../dto/settings.dto';
import { WAMonitoringService } from './monitor.service';

export class SettingsService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(SettingsService.name);

  public async create(instance: InstanceDto, data: SettingsDto) {
    this.logger.verbose('create settings: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setSettings(data);

    if (data.ignore_list && data.ignore_list.length > 0) {
      // Cleanup old messages
      const db = configService.get<Database>('DATABASE');
      const connection = dbserver.getClient().db(db.CONNECTION.DB_PREFIX_NAME + '-whatsapp-api');
      const messages = connection.collection('messages');
      for (const contact of data.ignore_list) {
        this.logger.verbose('Cleaning up messages for ' + contact);
        await messages.deleteMany({ owner: instance.instanceName, 'key.remoteJid': contact });
      }
    }

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
