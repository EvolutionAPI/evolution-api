import axios from 'axios';
import { execSync } from 'child_process';

import { ConfigService, ProviderSession } from '../../config/env.config';
import { Logger } from '../../config/logger.config';

type ResponseSuccess = { status: number; data?: any };
type ResponseProvider = Promise<[ResponseSuccess?, Error?]>;

export class ProviderFiles {
  constructor(private readonly configService: ConfigService) {
    this.baseUrl = `http://${this.config.HOST}:${this.config.PORT}/session`;
  }

  private readonly logger = new Logger(ProviderFiles.name);

  private baseUrl: string;

  private readonly config = Object.freeze(this.configService.get<ProviderSession>('PROVIDER'));

  private readonly prefix = Object.freeze(this.configService.get<ProviderSession>('PROVIDER').PREFIX);

  get isEnabled() {
    return !!this.config?.ENABLED;
  }

  public async onModuleInit() {
    if (this.config.ENABLED) {
      const client = axios.create({
        baseURL: this.baseUrl,
      });
      try {
        const response = await client.options('/ping');
        if (!response?.data?.pong) {
          throw new Error('Offline file provider.');
        }
      } catch (error) {
        this.logger.error(['Failed to connect to the file server', error?.message, error?.stack]);
        const pid = process.pid;
        execSync(`kill -9 ${pid}`);
      }
    }
  }

  public async onModuleDestroy() {
    //
  }

  public async create(instance: string): ResponseProvider {
    try {
      const response = await axios.post(`${this.baseUrl}/${this.prefix}`, {
        instance,
      });
      return [{ status: response.status, data: response?.data }];
    } catch (error) {
      return [
        {
          status: error?.response?.status,
          data: error?.response?.data,
        },
        error,
      ];
    }
  }

  public async write(instance: string, key: string, data: any): ResponseProvider {
    try {
      const response = await axios.post(`${this.baseUrl}/${this.prefix}/${instance}/${key}`, data);
      return [{ status: response.status, data: response?.data }];
    } catch (error) {
      return [
        {
          status: error?.response?.status,
          data: error?.response?.data,
        },
        error,
      ];
    }
  }

  public async read(instance: string, key: string): ResponseProvider {
    try {
      const response = await axios.get(`${this.baseUrl}/${this.prefix}/${instance}/${key}`);
      return [{ status: response.status, data: response?.data }];
    } catch (error) {
      return [
        {
          status: error?.response?.status,
          data: error?.response?.data,
        },
        error,
      ];
    }
  }

  public async delete(instance: string, key: string): ResponseProvider {
    try {
      const response = await axios.delete(`${this.baseUrl}/${this.prefix}/${instance}/${key}`);
      return [{ status: response.status, data: response?.data }];
    } catch (error) {
      return [
        {
          status: error?.response?.status,
          data: error?.response?.data,
        },
        error,
      ];
    }
  }

  public async allInstances(): ResponseProvider {
    try {
      const response = await axios.get(`${this.baseUrl}/list-instances/${this.prefix}`);
      return [{ status: response.status, data: response?.data as string[] }];
    } catch (error) {
      return [
        {
          status: error?.response?.status,
          data: error?.response?.data,
        },
        error,
      ];
    }
  }

  public async removeSession(instance: string): ResponseProvider {
    try {
      const response = await axios.delete(`${this.baseUrl}/${this.prefix}/${instance}`);
      return [{ status: response.status, data: response?.data }];
    } catch (error) {
      return [
        {
          status: error?.response?.status,
          data: error?.response?.data,
        },
        error,
      ];
    }
  }
}
