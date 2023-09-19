import { isBooleanString } from 'class-validator';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

export type HttpServer = { TYPE: 'http' | 'https'; PORT: number; URL: string };

export type HttpMethods = 'POST' | 'GET' | 'PUT' | 'DELETE';
export type Cors = {
  ORIGIN: string[];
  METHODS: HttpMethods[];
  CREDENTIALS: boolean;
};

export type LogBaileys = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export type LogLevel = 'ERROR' | 'WARN' | 'DEBUG' | 'INFO' | 'LOG' | 'VERBOSE' | 'DARK' | 'WEBHOOKS';

export type Log = {
  LEVEL: LogLevel[];
  COLOR: boolean;
  BAILEYS: LogBaileys;
};

export type SaveData = {
  INSTANCE: boolean;
  NEW_MESSAGE: boolean;
  MESSAGE_UPDATE: boolean;
  CONTACTS: boolean;
  CHATS: boolean;
};

export type StoreConf = {
  MESSAGES: boolean;
  MESSAGE_UP: boolean;
  CONTACTS: boolean;
  CHATS: boolean;
};

export type CleanStoreConf = {
  CLEANING_INTERVAL: number;
  MESSAGES: boolean;
  MESSAGE_UP: boolean;
  CONTACTS: boolean;
  CHATS: boolean;
};

export type DBConnection = {
  URI: string;
  DB_PREFIX_NAME: string;
};
export type Database = {
  CONNECTION: DBConnection;
  ENABLED: boolean;
  SAVE_DATA: SaveData;
};

export type Redis = {
  ENABLED: boolean;
  URI: string;
  PREFIX_KEY: string;
};

export type Rabbitmq = {
  ENABLED: boolean;
  URI: string;
};

export type Websocket = {
  ENABLED: boolean;
};

export type EventsWebhook = {
  APPLICATION_STARTUP: boolean;
  QRCODE_UPDATED: boolean;
  MESSAGES_SET: boolean;
  MESSAGES_UPSERT: boolean;
  MESSAGES_UPDATE: boolean;
  MESSAGES_DELETE: boolean;
  SEND_MESSAGE: boolean;
  CONTACTS_SET: boolean;
  CONTACTS_UPDATE: boolean;
  CONTACTS_UPSERT: boolean;
  PRESENCE_UPDATE: boolean;
  CHATS_SET: boolean;
  CHATS_UPDATE: boolean;
  CHATS_DELETE: boolean;
  CHATS_UPSERT: boolean;
  CONNECTION_UPDATE: boolean;
  GROUPS_UPSERT: boolean;
  GROUP_UPDATE: boolean;
  GROUP_PARTICIPANTS_UPDATE: boolean;
  CALL: boolean;
  NEW_JWT_TOKEN: boolean;
};

export type ApiKey = { KEY: string };
export type Jwt = { EXPIRIN_IN: number; SECRET: string };

export type Auth = {
  API_KEY: ApiKey;
  EXPOSE_IN_FETCH_INSTANCES: boolean;
  JWT: Jwt;
  TYPE: 'jwt' | 'apikey';
};

export type DelInstance = number | boolean;

export type GlobalWebhook = {
  URL: string;
  ENABLED: boolean;
  WEBHOOK_BY_EVENTS: boolean;
};
export type SslConf = { PRIVKEY: string; FULLCHAIN: string };
export type Webhook = { GLOBAL?: GlobalWebhook; EVENTS: EventsWebhook };
export type ConfigSessionPhone = { CLIENT: string; NAME: string };
export type QrCode = { LIMIT: number; COLOR: string };
export type Production = boolean;

export interface Env {
  SERVER: HttpServer;
  CORS: Cors;
  SSL_CONF: SslConf;
  STORE: StoreConf;
  CLEAN_STORE: CleanStoreConf;
  DATABASE: Database;
  REDIS: Redis;
  RABBITMQ: Rabbitmq;
  WEBSOCKET: Websocket;
  LOG: Log;
  DEL_INSTANCE: DelInstance;
  WEBHOOK: Webhook;
  CONFIG_SESSION_PHONE: ConfigSessionPhone;
  QRCODE: QrCode;
  AUTHENTICATION: Auth;
  PRODUCTION?: Production;
}

export type Key = keyof Env;

export class ConfigService {
  constructor() {
    this.loadEnv();
  }

  private env: Env;

  public get<T = any>(key: Key) {
    return this.env[key] as T;
  }

  private loadEnv() {
    this.env = !(process.env?.DOCKER_ENV === 'true') ? this.envYaml() : this.envProcess();
    this.env.PRODUCTION = process.env?.NODE_ENV === 'PROD';
    if (process.env?.DOCKER_ENV === 'true') {
      this.env.SERVER.TYPE = 'http';
      this.env.SERVER.PORT = 8080;
    }
  }

  private envYaml(): Env {
    return load(readFileSync(join(process.cwd(), 'src', 'env.yml'), { encoding: 'utf-8' })) as Env;
  }

  private envProcess(): Env {
    return {
      SERVER: {
        TYPE: process.env.SERVER_TYPE as 'http' | 'https',
        PORT: Number.parseInt(process.env.SERVER_PORT),
        URL: process.env.SERVER_URL,
      },
      CORS: {
        ORIGIN: process.env.CORS_ORIGIN.split(','),
        METHODS: process.env.CORS_METHODS.split(',') as HttpMethods[],
        CREDENTIALS: process.env?.CORS_CREDENTIALS === 'true',
      },
      SSL_CONF: {
        PRIVKEY: process.env?.SSL_CONF_PRIVKEY,
        FULLCHAIN: process.env?.SSL_CONF_FULLCHAIN,
      },
      STORE: {
        MESSAGES: process.env?.STORE_MESSAGES === 'true',
        MESSAGE_UP: process.env?.STORE_MESSAGE_UP === 'true',
        CONTACTS: process.env?.STORE_CONTACTS === 'true',
        CHATS: process.env?.STORE_CHATS === 'true',
      },
      CLEAN_STORE: {
        CLEANING_INTERVAL: Number.isInteger(process.env?.CLEAN_STORE_CLEANING_TERMINAL)
          ? Number.parseInt(process.env.CLEAN_STORE_CLEANING_TERMINAL)
          : 7200,
        MESSAGES: process.env?.CLEAN_STORE_MESSAGES === 'true',
        MESSAGE_UP: process.env?.CLEAN_STORE_MESSAGE_UP === 'true',
        CONTACTS: process.env?.CLEAN_STORE_CONTACTS === 'true',
        CHATS: process.env?.CLEAN_STORE_CHATS === 'true',
      },
      DATABASE: {
        CONNECTION: {
          URI: process.env.DATABASE_CONNECTION_URI,
          DB_PREFIX_NAME: process.env.DATABASE_CONNECTION_DB_PREFIX_NAME,
        },
        ENABLED: process.env?.DATABASE_ENABLED === 'true',
        SAVE_DATA: {
          INSTANCE: process.env?.DATABASE_SAVE_DATA_INSTANCE === 'true',
          NEW_MESSAGE: process.env?.DATABASE_SAVE_DATA_NEW_MESSAGE === 'true',
          MESSAGE_UPDATE: process.env?.DATABASE_SAVE_MESSAGE_UPDATE === 'true',
          CONTACTS: process.env?.DATABASE_SAVE_DATA_CONTACTS === 'true',
          CHATS: process.env?.DATABASE_SAVE_DATA_CHATS === 'true',
        },
      },
      REDIS: {
        ENABLED: process.env?.REDIS_ENABLED === 'true',
        URI: process.env.REDIS_URI,
        PREFIX_KEY: process.env.REDIS_PREFIX_KEY,
      },
      RABBITMQ: {
        ENABLED: process.env?.RABBITMQ_ENABLED === 'true',
        URI: process.env.RABBITMQ_URI,
      },
      WEBSOCKET: {
        ENABLED: process.env?.WEBSOCKET_ENABLED === 'true',
      },
      LOG: {
        LEVEL: process.env?.LOG_LEVEL.split(',') as LogLevel[],
        COLOR: process.env?.LOG_COLOR === 'true',
        BAILEYS: (process.env?.LOG_BAILEYS as LogBaileys) || 'error',
      },
      DEL_INSTANCE: process.env?.DEL_INSTANCE === 'true'
        ? 5
        : Number.parseInt(process.env.DEL_INSTANCE) || false,
      WEBHOOK: {
        GLOBAL: {
          URL: process.env?.WEBHOOK_GLOBAL_URL,
          ENABLED: process.env?.WEBHOOK_GLOBAL_ENABLED === 'true',
          WEBHOOK_BY_EVENTS: process.env?.WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS === 'true',
        },
        EVENTS: {
          APPLICATION_STARTUP: process.env?.WEBHOOK_EVENTS_APPLICATION_STARTUP === 'true',
          QRCODE_UPDATED: process.env?.WEBHOOK_EVENTS_QRCODE_UPDATED === 'true',
          MESSAGES_SET: process.env?.WEBHOOK_EVENTS_MESSAGES_SET === 'true',
          MESSAGES_UPSERT: process.env?.WEBHOOK_EVENTS_MESSAGES_UPSERT === 'true',
          MESSAGES_UPDATE: process.env?.WEBHOOK_EVENTS_MESSAGES_UPDATE === 'true',
          MESSAGES_DELETE: process.env?.WEBHOOK_EVENTS_MESSAGES_DELETE === 'true',
          SEND_MESSAGE: process.env?.WEBHOOK_EVENTS_SEND_MESSAGE === 'true',
          CONTACTS_SET: process.env?.WEBHOOK_EVENTS_CONTACTS_SET === 'true',
          CONTACTS_UPDATE: process.env?.WEBHOOK_EVENTS_CONTACTS_UPDATE === 'true',
          CONTACTS_UPSERT: process.env?.WEBHOOK_EVENTS_CONTACTS_UPSERT === 'true',
          PRESENCE_UPDATE: process.env?.WEBHOOK_EVENTS_PRESENCE_UPDATE === 'true',
          CHATS_SET: process.env?.WEBHOOK_EVENTS_CHATS_SET === 'true',
          CHATS_UPDATE: process.env?.WEBHOOK_EVENTS_CHATS_UPDATE === 'true',
          CHATS_UPSERT: process.env?.WEBHOOK_EVENTS_CHATS_UPSERT === 'true',
          CHATS_DELETE: process.env?.WEBHOOK_EVENTS_CHATS_DELETE === 'true',
          CONNECTION_UPDATE: process.env?.WEBHOOK_EVENTS_CONNECTION_UPDATE === 'true',
          GROUPS_UPSERT: process.env?.WEBHOOK_EVENTS_GROUPS_UPSERT === 'true',
          GROUP_UPDATE: process.env?.WEBHOOK_EVENTS_GROUPS_UPDATE === 'true',
          GROUP_PARTICIPANTS_UPDATE: process.env?.WEBHOOK_EVENTS_GROUP_PARTICIPANTS_UPDATE === 'true',
          CALL: process.env?.WEBHOOK_EVENTS_CALL === 'true',
          NEW_JWT_TOKEN: process.env?.WEBHOOK_EVENTS_NEW_JWT_TOKEN === 'true',
        },
      },
      CONFIG_SESSION_PHONE: {
        CLIENT: process.env?.CONFIG_SESSION_PHONE_CLIENT || 'Evolution API',
        NAME: process.env?.CONFIG_SESSION_PHONE_NAME || 'chrome',
      },
      QRCODE: {
        LIMIT: Number.parseInt(process.env.QRCODE_LIMIT) || 30,
        COLOR: process.env.QRCODE_COLOR || '#198754',
      },
      AUTHENTICATION: {
        TYPE: process.env.AUTHENTICATION_TYPE as 'jwt',
        API_KEY: {
          KEY: process.env.AUTHENTICATION_API_KEY,
        },
        EXPOSE_IN_FETCH_INSTANCES: process.env?.AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES === 'true',
        JWT: {
          EXPIRIN_IN: Number.isInteger(process.env?.AUTHENTICATION_JWT_EXPIRIN_IN)
            ? Number.parseInt(process.env.AUTHENTICATION_JWT_EXPIRIN_IN)
            : 3600,
          SECRET: process.env.AUTHENTICATION_JWT_SECRET,
        },
      },
    };
  }
}

export const configService = new ConfigService();
