import { Logger } from '../../config/logger.config';
import { initQueues } from '../../libs/amqp.server';
import { InstanceDto } from '../dto/instance.dto';
import { OpenaiDto } from '../dto/openai.dto';
import { ContactOpenaiDto } from '../dto/contactopenai.dto';
import { OpenaiRaw } from '../models';
import { WAMonitoringService } from './monitor.service';

export class OpenaiService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger(OpenaiService.name);

  public create(instance: InstanceDto, data: OpenaiDto) {
    this.logger.verbose('create openai: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setOpenai(data);
    return { openai: { ...instance, openai: data } };
  }

  public async find(instance: InstanceDto): Promise<OpenaiRaw> {
    try {
      this.logger.verbose('find openai: ' + instance.instanceName);
      const result = await this.waMonitor.waInstances[instance.instanceName].findOpenai();

      if (Object.keys(result).length === 0) {
        throw new Error('openai not found');
      }

      return result;
    } catch (error) {
      return { chave: '', enabled: false, events: [] };
    }
  }

  public createContact(instance: InstanceDto, data: ContactOpenaiDto) {
    this.logger.verbose('create openai: ' + instance.instanceName);
    this.waMonitor.waInstances[instance.instanceName].setContactOpenai(data);
    return { openai: { ...instance, openai: data } };
  }


  public async findContact(instance: InstanceDto): Promise<OpenaiRaw> {
    try {
      this.logger.verbose('find openai: ' + instance.instanceName);
      const result = await this.waMonitor.waInstances[instance.instanceName].findContactOpenai();

      if (Object.keys(result).length === 0) {
        throw new Error('openai not found');
      }

      return result;
    } catch (error) {
      return { chave: '', enabled: false, events: [] };
    }
  }
  
}
