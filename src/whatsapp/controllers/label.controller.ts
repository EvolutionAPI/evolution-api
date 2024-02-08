import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { HandleLabelDto } from '../dto/label.dto';
import { WAMonitoringService } from '../services/monitor.service';

const logger = new Logger('LabelController');

export class LabelController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async fetchLabels({ instanceName }: InstanceDto) {
    logger.verbose('requested fetchLabels from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].fetchLabels();
  }

  public async handleLabel({ instanceName }: InstanceDto, data: HandleLabelDto) {
    logger.verbose('requested chat label change from ' + instanceName + ' instance');
    return await this.waMonitor.waInstances[instanceName].handleLabel(data);
  }
}
