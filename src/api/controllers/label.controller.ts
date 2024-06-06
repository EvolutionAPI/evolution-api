import { InstanceDto } from '../dto/instance.dto';
import { HandleLabelDto } from '../dto/label.dto';
import { WAMonitoringService } from '../services/monitor.service';

export class LabelController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async fetchLabels({ instanceName }: InstanceDto) {
    return await this.waMonitor.waInstances[instanceName].fetchLabels();
  }

  public async handleLabel({ instanceName }: InstanceDto, data: HandleLabelDto) {
    return await this.waMonitor.waInstances[instanceName].handleLabel(data);
  }
}
