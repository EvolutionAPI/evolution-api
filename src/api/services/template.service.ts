import { InstanceDto } from '@api/dto/instance.dto';
import { TemplateDto } from '@api/dto/template.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { ConfigService, WaBusiness } from '@config/env.config';
import { Logger } from '@config/logger.config';
import axios from 'axios';

import { WAMonitoringService } from './monitor.service';

export class TemplateService {
  constructor(
    private readonly waMonitor: WAMonitoringService,
    public readonly prismaRepository: PrismaRepository,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger('TemplateService');

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

  public async create(instance: InstanceDto, data: TemplateDto) {
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

      if (!response || response.error) {
        // If there's an error from WhatsApp API, throw it with the real error data
        if (response && response.error) {
          // Create an error object that includes the template field for Meta errors
          const metaError = new Error(response.error.message || 'WhatsApp API Error');
          (metaError as any).template = response.error;
          throw metaError;
        }
        throw new Error('Error to create template');
      }

      const template = await this.prismaRepository.template.create({
        data: {
          templateId: response.id,
          name: data.name,
          template: response,
          webhookUrl: data.webhookUrl,
          instanceId: getInstance.id,
        },
      });

      return template;
    } catch (error) {
      this.logger.error('Error in create template: ' + error);
      // Propagate the real error instead of "engolindo" it
      throw error;
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
      }
    } catch (e) {
      this.logger.error(
        'WhatsApp API request error: ' + (e.response?.data ? JSON.stringify(e.response?.data) : e.message),
      );

      // Return the complete error response from WhatsApp API
      if (e.response?.data) {
        return e.response.data;
      }

      // If no response data, throw connection error
      throw new Error(`Connection error: ${e.message}`);
    }
  }
}
