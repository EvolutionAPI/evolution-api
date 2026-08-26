import { SaveContactDto } from '@api/dto/contact.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { WAMonitoringService } from '@api/services/monitor.service';

export class ContactController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async saveContact({ instanceName }: InstanceDto, data: SaveContactDto) {
    return await this.waMonitor.waInstances[instanceName].saveContact(data);
  }
}
