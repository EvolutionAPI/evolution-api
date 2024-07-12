import { Template } from '@prisma/client';
import axios from 'axios';

import { ConfigService, WaBusiness } from '../../config/env.config';
import { Logger } from '../../config/logger.config';
import { InstanceDto } from '../dto/instance.dto';
import { TemplateDto } from '../dto/template.dto';
import { PrismaRepository } from '../repository/repository.service';
import { WAMonitoringService } from './monitor.service';

export class TemplateService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    public readonly prismaRepository: PrismaRepository,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(TemplateService.name);

  private businessId: string;
  private token: string;

  public async find(instance: InstanceDto) {
    const getInstance = await this.waMonitor.waInstances[instance.instanceName].instance;

    if (!getInstance) {
      throw new Error('Instance not found');
    }

    this.businessId = getInstance.businessId;
    this.token = getInstance.token;

    const response = await this.requestTemplate({}, 'GET');

    if (!response) {
      throw new Error('Error to create template');
    }

    return response.data;
  }

  public async create(instance: InstanceDto, data: TemplateDto): Promise<Template> {
    try {
      const getInstance = await this.waMonitor.waInstances[instance.instanceName].instance;

      if (!getInstance) {
        throw new Error('Instance not found');
      }

      this.businessId = getInstance.businessId;
      this.token = getInstance.token;

      const postData = {
        name: data.name,
        category: data.category,
        allow_category_change: data.allowCategoryChange,
        language: data.language,
        components: data.components,
      };

      const response = await this.requestTemplate(postData, 'POST');

      if (!response) {
        throw new Error('Error to create template');
      }

      console.log(response);

      const template = await this.prismaRepository.template.create({
        data: {
          instanceId: getInstance.id,
          templateId: response.id,
          name: data.name,
          language: data.language,
        },
      });

      return template;
    } catch (error) {
      this.logger.error(error);
      throw new Error('Error to create template');
    }
  }

  private async requestTemplate(data: any, method: string) {
    try {
      let urlServer = this.configService.get<WaBusiness>('WA_BUSINESS').URL;
      const version = this.configService.get<WaBusiness>('WA_BUSINESS').VERSION;
      urlServer = `${urlServer}/${version}/${this.businessId}/message_templates`;
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` };
      if (method === 'GET') {
        const result = await axios.get(urlServer, { headers });
        return result.data;
      } else if (method === 'POST') {
        const result = await axios.post(urlServer, data, { headers });
        return result.data;
      } else if (method === 'DELETE') {
        const result = await axios.delete(urlServer + '/' + data, { headers });
        return result.data;
      }
    } catch (e) {
      this.logger.error(e.response.data);
      return null;
    }
  }
}
