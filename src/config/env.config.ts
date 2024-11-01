import { isBooleanString } from 'class-validator';
import dotenv from 'dotenv';

dotenv.config();

// ... (keep the existing types and interfaces)

export class ConfigService {
  constructor() {
    this.loadEnv();
  }

  private env: Env;

  public get<T = any>(key: Key) {
    return this.env[key] as T;
  }

  private loadEnv() {
    this.env = this.envProcess();
    this.env.PRODUCTION = process.env?.NODE_ENV === 'PROD';
    if (process.env?.DOCKER_ENV === 'true') {
      this.env.SERVER.TYPE = process.env.SERVER_TYPE as 'http' | 'http';
      this.env.SERVER.PORT = Number.parseInt(process.env.SERVER_PORT) || 8080;
    }
  }

  private envProcess(): Env {
    return {
      // ... (keep other configurations)

      DATABASE: {
        CONNECTION: {
          URI: process.env.DATABASE_CONNECTION_URI || '',
          CLIENT_NAME: process.env.DATABASE_CONNECTION_CLIENT_NAME || 'evolution',
        },
        PROVIDER: process.env.DATABASE_PROVIDER || 'postgresql',
        // ... (keep other database configurations)
      },

      // ... (keep other configurations)
    };
  }
}

export const configService = new ConfigService();
