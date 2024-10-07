import { OfferCallDto } from '@api/dto/call.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { WAMonitoringService } from '@api/services/monitor.service';

export class CallController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async offerCall({ instanceName }: InstanceDto, data: OfferCallDto) {
    return await this.waMonitor.waInstances[instanceName].offerCall(data);
  }
}
