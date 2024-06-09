import axios from 'axios';
import { execSync } from 'child_process';

import { Auth, ConfigService, ProviderSession } from '../../config/env.config';
import { Logger } from '../../config/logger.config';

type ResponseSuccess = { status: number; data?: any };
type ResponseProvider = Promise<[ResponseSuccess?, Error?]>;

export class ProviderFiles {
  constructor(private readonly configService: ConfigService) {
    this.baseUrl = `http://${this.config.HOST}:${this.config.PORT}/session/${this.config.PREFIX}`;
    this.globalApiToken = this.configService.get<Auth>('AUTHENTICATION').API_KEY.KEY;
  }

  private readonly logger = new Logger(ProviderFiles.name);

  private baseUrl: string;
  private globalApiToken: string;

  private readonly config = Object.freeze(this.configService.get<ProviderSession>('PROVIDER'));

  get isEnabled() {
    return !!this.config?.ENABLED;
  }

  public async onModuleInit() {
    if (this.config.ENABLED) {
      const url = `http://${this.config.HOST}:${this.config.PORT}`;
      try {
        const response = await axios.options(url + '/ping');
        if (response?.data != 'pong') {
          throw new Error('Offline file provider.');
        }

        await axios.post(`${url}/session`, { group: this.config.PREFIX }, { headers: { apikey: this.globalApiToken } });
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
      const response = await axios.post(
        `${this.baseUrl}`,
        {
          instance,
        },
        { headers: { apikey: this.globalApiToken } },
      );
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
      const response = await axios.post(`${this.baseUrl}/${instance}/${key}`, data, {
        headers: { apikey: this.globalApiToken },
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

  public async read(instance: string, key: string): ResponseProvider {
    try {
      const response = await axios.get(`${this.baseUrl}/${instance}/${key}`, {
        headers: { apikey: this.globalApiToken },
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

  public async delete(instance: string, key: string): ResponseProvider {
    try {
      const response = await axios.delete(`${this.baseUrl}/${instance}/${key}`, {
        headers: { apikey: this.globalApiToken },
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

  public async allInstances(): ResponseProvider {
    try {
      const response = await axios.get(`${this.baseUrl}/list-instances`, { headers: { apikey: this.globalApiToken } });
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
      const response = await axios.delete(`${this.baseUrl}/${instance}`, { headers: { apikey: this.globalApiToken } });
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
