import { isBooleanString } from 'class-validator';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

export type HttpServer = {
  TYPE: 'http' | 'https';
  PORT: number;
  URL: string;
  DISABLE_DOCS: boolean;
  DISABLE_MANAGER: boolean;
};

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

export type ProviderSession = {
  ENABLED: boolean;
  HOST: string;
  PORT: string;
  PREFIX: string;
};

export type SaveData = {
  INSTANCE: boolean;
  NEW_MESSAGE: boolean;
  MESSAGE_UPDATE: boolean;
  CONTACTS: boolean;
  CHATS: boolean;
  LABELS: boolean;
};

export type StoreConf = {
  MESSAGES: boolean;
  MESSAGE_UP: boolean;
  CONTACTS: boolean;
  CHATS: boolean;
  LABELS: boolean;
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

export type EventsRabbitmq = {
  APPLICATION_STARTUP: boolean;
  INSTANCE_CREATE: boolean;
  INSTANCE_DELETE: boolean;
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
  LABELS_EDIT: boolean;
  LABELS_ASSOCIATION: boolean;
  GROUPS_UPSERT: boolean;
  GROUP_UPDATE: boolean;
  GROUP_PARTICIPANTS_UPDATE: boolean;
  CALL: boolean;
  NEW_JWT_TOKEN: boolean;
  TYPEBOT_START: boolean;
  TYPEBOT_CHANGE_STATUS: boolean;
};

export type Rabbitmq = {
  ENABLED: boolean;
  URI: string;
  EXCHANGE_NAME: string;
  GLOBAL_ENABLED: boolean;
  EVENTS: EventsRabbitmq;
};

export type Sqs = {
  ENABLED: boolean;
  ACCESS_KEY_ID: string;
  SECRET_ACCESS_KEY: string;
  ACCOUNT_ID: string;
  REGION: string;
};

export type Websocket = {
  ENABLED: boolean;
  GLOBAL_EVENTS: boolean;
};

export type WaBusiness = {
  TOKEN_WEBHOOK: string;
  URL: string;
  VERSION: string;
  LANGUAGE: string;
};

export type EventsWebhook = {
  APPLICATION_STARTUP: boolean;
  INSTANCE_CREATE: boolean;
  INSTANCE_DELETE: boolean;
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
  LABELS_EDIT: boolean;
  LABELS_ASSOCIATION: boolean;
  GROUPS_UPSERT: boolean;
  GROUP_UPDATE: boolean;
  GROUP_PARTICIPANTS_UPDATE: boolean;
  CALL: boolean;
  NEW_JWT_TOKEN: boolean;
  TYPEBOT_START: boolean;
  TYPEBOT_CHANGE_STATUS: boolean;
  CHAMA_AI_ACTION: boolean;
  ERRORS: boolean;
  ERRORS_WEBHOOK: string;
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

export type Language = string | 'en';

export type GlobalWebhook = {
  URL: string;
  ENABLED: boolean;
  WEBHOOK_BY_EVENTS: boolean;
};
export type CacheConfRedis = {
  ENABLED: boolean;
  URI: string;
  PREFIX_KEY: string;
  TTL: number;
  SAVE_INSTANCES: boolean;
};
export type CacheConfLocal = {
  ENABLED: boolean;
  TTL: number;
};
export type SslConf = { PRIVKEY: string; FULLCHAIN: string };
export type Webhook = { GLOBAL?: GlobalWebhook; EVENTS: EventsWebhook };
export type ConfigSessionPhone = { CLIENT: string; NAME: string; VERSION: string };
export type QrCode = { LIMIT: number; COLOR: string };
export type Typebot = { API_VERSION: string; KEEP_OPEN: boolean };
export type Chatwoot = {
  MESSAGE_DELETE: boolean;
  MESSAGE_READ: boolean;
  IMPORT: {
    DATABASE: {
      CONNECTION: {
        URI: string;
      };
    };
    PLACEHOLDER_MEDIA_MESSAGE: boolean;
  };
};

export type CacheConf = { REDIS: CacheConfRedis; LOCAL: CacheConfLocal };
export type Production = boolean;

export interface Env {
  SERVER: HttpServer;
  CORS: Cors;
  SSL_CONF: SslConf;
  PROVIDER: ProviderSession;
  STORE: StoreConf;
  CLEAN_STORE: CleanStoreConf;
  DATABASE: Database;
  RABBITMQ: Rabbitmq;
  SQS: Sqs;
  WEBSOCKET: Websocket;
  WA_BUSINESS: WaBusiness;
  LOG: Log;
  DEL_INSTANCE: DelInstance;
  DEL_TEMP_INSTANCES: boolean;
  LANGUAGE: Language;
  WEBHOOK: Webhook;
  CONFIG_SESSION_PHONE: ConfigSessionPhone;
  QRCODE: QrCode;
  TYPEBOT: Typebot;
  CHATWOOT: Chatwoot;
  CACHE: CacheConf;
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
      this.env.SERVER.TYPE = process.env.SERVER_TYPE as 'http' | 'http';
      this.env.SERVER.PORT = Number.parseInt(process.env.SERVER_PORT) || 8080;
    }
  }

  private envYaml(): Env {
    return load(readFileSync(join(process.cwd(), 'src', 'env.yml'), { encoding: 'utf-8' })) as Env;
  }

  private envProcess(): Env {
    return {
      SERVER: {
        TYPE: (process.env.SERVER_TYPE as 'http' | 'https') || 'http',
        PORT: Number.parseInt(process.env.SERVER_PORT) || 8080,
        URL: process.env.SERVER_URL,
        DISABLE_DOCS: process.env?.SERVER_DISABLE_DOCS === 'true',
        DISABLE_MANAGER: process.env?.SERVER_DISABLE_MANAGER === 'true',
      },
      CORS: {
        ORIGIN: process.env.CORS_ORIGIN.split(',') || ['*'],
        METHODS: (process.env.CORS_METHODS.split(',') as HttpMethods[]) || ['POST', 'GET', 'PUT', 'DELETE'],
        CREDENTIALS: process.env?.CORS_CREDENTIALS === 'true',
      },
      SSL_CONF: {
        PRIVKEY: process.env?.SSL_CONF_PRIVKEY || '',
        FULLCHAIN: process.env?.SSL_CONF_FULLCHAIN || '',
      },
      PROVIDER: {
        ENABLED: process.env?.PROVIDER_ENABLED === 'true',
        HOST: process.env.PROVIDER_HOST,
        PORT: process.env?.PROVIDER_PORT || '5656',
        PREFIX: process.env?.PROVIDER_PREFIX || 'evolution',
      },
      STORE: {
        MESSAGES: process.env?.STORE_MESSAGES === 'true',
        MESSAGE_UP: process.env?.STORE_MESSAGE_UP === 'true',
        CONTACTS: process.env?.STORE_CONTACTS === 'true',
        CHATS: process.env?.STORE_CHATS === 'true',
        LABELS: process.env?.STORE_LABELS === 'true',
      },
      CLEAN_STORE: {
        CLEANING_INTERVAL: Number.isInteger(process.env?.CLEAN_STORE_CLEANING_INTERVAL)
          ? Number.parseInt(process.env.CLEAN_STORE_CLEANING_INTERVAL)
          : 7200,
        MESSAGES: process.env?.CLEAN_STORE_MESSAGES === 'true',
        MESSAGE_UP: process.env?.CLEAN_STORE_MESSAGE_UP === 'true',
        CONTACTS: process.env?.CLEAN_STORE_CONTACTS === 'true',
        CHATS: process.env?.CLEAN_STORE_CHATS === 'true',
      },
      DATABASE: {
        CONNECTION: {
          URI: process.env.DATABASE_CONNECTION_URI || '',
          DB_PREFIX_NAME: process.env.DATABASE_CONNECTION_DB_PREFIX_NAME || 'evolution',
        },
        ENABLED: process.env?.DATABASE_ENABLED === 'true',
        SAVE_DATA: {
          INSTANCE: process.env?.DATABASE_SAVE_DATA_INSTANCE === 'true',
          NEW_MESSAGE: process.env?.DATABASE_SAVE_DATA_NEW_MESSAGE === 'true',
          MESSAGE_UPDATE: process.env?.DATABASE_SAVE_MESSAGE_UPDATE === 'true',
          CONTACTS: process.env?.DATABASE_SAVE_DATA_CONTACTS === 'true',
          CHATS: process.env?.DATABASE_SAVE_DATA_CHATS === 'true',
          LABELS: process.env?.DATABASE_SAVE_DATA_LABELS === 'true',
        },
      },
      RABBITMQ: {
        ENABLED: process.env?.RABBITMQ_ENABLED === 'true',
        GLOBAL_ENABLED: process.env?.RABBITMQ_GLOBAL_ENABLED === 'true',
        EXCHANGE_NAME: process.env?.RABBITMQ_EXCHANGE_NAME || 'evolution_exchange',
        URI: process.env.RABBITMQ_URI || '',
        EVENTS: {
          APPLICATION_STARTUP: process.env?.RABBITMQ_EVENTS_APPLICATION_STARTUP === 'true',
          INSTANCE_CREATE: process.env?.RABBITMQ_EVENTS_INSTANCE_CREATE === 'true',
          INSTANCE_DELETE: process.env?.RABBITMQ_EVENTS_INSTANCE_DELETE === 'true',
          QRCODE_UPDATED: process.env?.RABBITMQ_EVENTS_QRCODE_UPDATED === 'true',
          MESSAGES_SET: process.env?.RABBITMQ_EVENTS_MESSAGES_SET === 'true',
          MESSAGES_UPSERT: process.env?.RABBITMQ_EVENTS_MESSAGES_UPSERT === 'true',
          MESSAGES_UPDATE: process.env?.RABBITMQ_EVENTS_MESSAGES_UPDATE === 'true',
          MESSAGES_DELETE: process.env?.RABBITMQ_EVENTS_MESSAGES_DELETE === 'true',
          SEND_MESSAGE: process.env?.RABBITMQ_EVENTS_SEND_MESSAGE === 'true',
          CONTACTS_SET: process.env?.RABBITMQ_EVENTS_CONTACTS_SET === 'true',
          CONTACTS_UPDATE: process.env?.RABBITMQ_EVENTS_CONTACTS_UPDATE === 'true',
          CONTACTS_UPSERT: process.env?.RABBITMQ_EVENTS_CONTACTS_UPSERT === 'true',
          PRESENCE_UPDATE: process.env?.RABBITMQ_EVENTS_PRESENCE_UPDATE === 'true',
          CHATS_SET: process.env?.RABBITMQ_EVENTS_CHATS_SET === 'true',
          CHATS_UPDATE: process.env?.RABBITMQ_EVENTS_CHATS_UPDATE === 'true',
          CHATS_UPSERT: process.env?.RABBITMQ_EVENTS_CHATS_UPSERT === 'true',
          CHATS_DELETE: process.env?.RABBITMQ_EVENTS_CHATS_DELETE === 'true',
          CONNECTION_UPDATE: process.env?.RABBITMQ_EVENTS_CONNECTION_UPDATE === 'true',
          LABELS_EDIT: process.env?.RABBITMQ_EVENTS_LABELS_EDIT === 'true',
          LABELS_ASSOCIATION: process.env?.RABBITMQ_EVENTS_LABELS_ASSOCIATION === 'true',
          GROUPS_UPSERT: process.env?.RABBITMQ_EVENTS_GROUPS_UPSERT === 'true',
          GROUP_UPDATE: process.env?.RABBITMQ_EVENTS_GROUPS_UPDATE === 'true',
          GROUP_PARTICIPANTS_UPDATE: process.env?.RABBITMQ_EVENTS_GROUP_PARTICIPANTS_UPDATE === 'true',
          CALL: process.env?.RABBITMQ_EVENTS_CALL === 'true',
          NEW_JWT_TOKEN: process.env?.RABBITMQ_EVENTS_NEW_JWT_TOKEN === 'true',
          TYPEBOT_START: process.env?.RABBITMQ_EVENTS_TYPEBOT_START === 'true',
          TYPEBOT_CHANGE_STATUS: process.env?.RABBITMQ_EVENTS_TYPEBOT_CHANGE_STATUS === 'true',
        },
      },
      SQS: {
        ENABLED: process.env?.SQS_ENABLED === 'true',
        ACCESS_KEY_ID: process.env.SQS_ACCESS_KEY_ID || '',
        SECRET_ACCESS_KEY: process.env.SQS_SECRET_ACCESS_KEY || '',
        ACCOUNT_ID: process.env.SQS_ACCOUNT_ID || '',
        REGION: process.env.SQS_REGION || '',
      },
      WEBSOCKET: {
        ENABLED: process.env?.WEBSOCKET_ENABLED === 'true',
        GLOBAL_EVENTS: process.env?.WEBSOCKET_GLOBAL_EVENTS === 'true',
      },
      WA_BUSINESS: {
        TOKEN_WEBHOOK: process.env.WA_BUSINESS_TOKEN_WEBHOOK || 'evolution',
        URL: process.env.WA_BUSINESS_URL || 'https://graph.facebook.com',
        VERSION: process.env.WA_BUSINESS_VERSION || 'v19.0',
        LANGUAGE: process.env.WA_BUSINESS_LANGUAGE || 'en',
      },
      LOG: {
        LEVEL: (process.env?.LOG_LEVEL.split(',') as LogLevel[]) || [
          'ERROR',
          'WARN',
          'DEBUG',
          'INFO',
          'LOG',
          'VERBOSE',
          'DARK',
          'WEBHOOKS',
        ],
        COLOR: process.env?.LOG_COLOR === 'true',
        BAILEYS: (process.env?.LOG_BAILEYS as LogBaileys) || 'error',
      },
      DEL_INSTANCE: isBooleanString(process.env?.DEL_INSTANCE)
        ? process.env.DEL_INSTANCE === 'true'
        : Number.parseInt(process.env.DEL_INSTANCE) || false,
      DEL_TEMP_INSTANCES: isBooleanString(process.env?.DEL_TEMP_INSTANCES)
        ? process.env.DEL_TEMP_INSTANCES === 'true'
        : true,
      LANGUAGE: process.env?.LANGUAGE || 'en',
      WEBHOOK: {
        GLOBAL: {
          URL: process.env?.WEBHOOK_GLOBAL_URL || '',
          ENABLED: process.env?.WEBHOOK_GLOBAL_ENABLED === 'true',
          WEBHOOK_BY_EVENTS: process.env?.WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS === 'true',
        },
        EVENTS: {
          APPLICATION_STARTUP: process.env?.WEBHOOK_EVENTS_APPLICATION_STARTUP === 'true',
          INSTANCE_CREATE: process.env?.WEBHOOK_EVENTS_INSTANCE_CREATE === 'true',
          INSTANCE_DELETE: process.env?.WEBHOOK_EVENTS_INSTANCE_DELETE === 'true',
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
          LABELS_EDIT: process.env?.WEBHOOK_EVENTS_LABELS_EDIT === 'true',
          LABELS_ASSOCIATION: process.env?.WEBHOOK_EVENTS_LABELS_ASSOCIATION === 'true',
          GROUPS_UPSERT: process.env?.WEBHOOK_EVENTS_GROUPS_UPSERT === 'true',
          GROUP_UPDATE: process.env?.WEBHOOK_EVENTS_GROUPS_UPDATE === 'true',
          GROUP_PARTICIPANTS_UPDATE: process.env?.WEBHOOK_EVENTS_GROUP_PARTICIPANTS_UPDATE === 'true',
          CALL: process.env?.WEBHOOK_EVENTS_CALL === 'true',
          NEW_JWT_TOKEN: process.env?.WEBHOOK_EVENTS_NEW_JWT_TOKEN === 'true',
          TYPEBOT_START: process.env?.WEBHOOK_EVENTS_TYPEBOT_START === 'true',
          TYPEBOT_CHANGE_STATUS: process.env?.WEBHOOK_EVENTS_TYPEBOT_CHANGE_STATUS === 'true',
          CHAMA_AI_ACTION: process.env?.WEBHOOK_EVENTS_CHAMA_AI_ACTION === 'true',
          ERRORS: process.env?.WEBHOOK_EVENTS_ERRORS === 'true',
          ERRORS_WEBHOOK: process.env?.WEBHOOK_EVENTS_ERRORS_WEBHOOK || '',
        },
      },
      CONFIG_SESSION_PHONE: {
        CLIENT: process.env?.CONFIG_SESSION_PHONE_CLIENT || 'Evolution API',
        NAME: process.env?.CONFIG_SESSION_PHONE_NAME || 'Chrome',
        VERSION: process.env?.CONFIG_SESSION_PHONE_VERSION || null,
      },
      QRCODE: {
        LIMIT: Number.parseInt(process.env.QRCODE_LIMIT) || 30,
        COLOR: process.env.QRCODE_COLOR || '#198754',
      },
      TYPEBOT: {
        API_VERSION: process.env?.TYPEBOT_API_VERSION || 'old',
        KEEP_OPEN: process.env.TYPEBOT_KEEP_OPEN === 'true',
      },
      CHATWOOT: {
        MESSAGE_DELETE: process.env.CHATWOOT_MESSAGE_DELETE === 'false',
        MESSAGE_READ: process.env.CHATWOOT_MESSAGE_READ === 'false',
        IMPORT: {
          DATABASE: {
            CONNECTION: {
              URI: process.env.CHATWOOT_IMPORT_DATABASE_CONNECTION_URI || '',
            },
          },
          PLACEHOLDER_MEDIA_MESSAGE: process.env?.CHATWOOT_IMPORT_PLACEHOLDER_MEDIA_MESSAGE === 'true',
        },
      },
      CACHE: {
        REDIS: {
          ENABLED: process.env?.CACHE_REDIS_ENABLED === 'true',
          URI: process.env?.CACHE_REDIS_URI || '',
          PREFIX_KEY: process.env?.CACHE_REDIS_PREFIX_KEY || 'evolution-cache',
          TTL: Number.parseInt(process.env?.CACHE_REDIS_TTL) || 604800,
          SAVE_INSTANCES: process.env?.CACHE_REDIS_SAVE_INSTANCES === 'true',
        },
        LOCAL: {
          ENABLED: process.env?.CACHE_LOCAL_ENABLED === 'true',
          TTL: Number.parseInt(process.env?.CACHE_REDIS_TTL) || 86400,
        },
      },
      AUTHENTICATION: {
        TYPE: process.env.AUTHENTICATION_TYPE as 'apikey',
        API_KEY: {
          KEY: process.env.AUTHENTICATION_API_KEY || 'BQYHJGJHJ',
        },
        EXPOSE_IN_FETCH_INSTANCES: process.env?.AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES === 'true',
        JWT: {
          EXPIRIN_IN: Number.isInteger(process.env?.AUTHENTICATION_JWT_EXPIRIN_IN)
            ? Number.parseInt(process.env.AUTHENTICATION_JWT_EXPIRIN_IN)
            : 3600,
          SECRET: process.env.AUTHENTICATION_JWT_SECRET || 'L=0YWt]b2w[WF>#>:&E`',
        },
      },
    };
  }
}

export const configService = new ConfigService();
