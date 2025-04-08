import { isBooleanString } from 'class-validator';
import dotenv from 'dotenv';

dotenv.config();

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

export type LogLevel = 'ERROR' | 'WARN' | 'DEBUG' | 'INFO' | 'LOG' | 'VERBOSE' | 'DARK' | 'WEBHOOKS' | 'WEBSOCKET';

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
  HISTORIC: boolean;
  NEW_MESSAGE: boolean;
  MESSAGE_UPDATE: boolean;
  CONTACTS: boolean;
  CHATS: boolean;
  LABELS: boolean;
  IS_ON_WHATSAPP: boolean;
  IS_ON_WHATSAPP_DAYS: number;
};

export type DBConnection = {
  URI: string;
  CLIENT_NAME: string;
};
export type Database = {
  CONNECTION: DBConnection;
  PROVIDER: string;
  SAVE_DATA: SaveData;
  DELETE_DATA: DeleteData;
};

export type DeleteData = {
  LOGICAL_MESSAGE_DELETE: boolean;
};
export type EventsRabbitmq = {
  APPLICATION_STARTUP: boolean;
  INSTANCE_CREATE: boolean;
  INSTANCE_DELETE: boolean;
  QRCODE_UPDATED: boolean;
  MESSAGES_SET: boolean;
  MESSAGES_UPSERT: boolean;
  MESSAGES_EDITED: boolean;
  MESSAGES_UPDATE: boolean;
  MESSAGES_DELETE: boolean;
  SEND_MESSAGE: boolean;
  SEND_MESSAGE_UPDATE: boolean;
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
  TYPEBOT_START: boolean;
  TYPEBOT_CHANGE_STATUS: boolean;
};

export type Rabbitmq = {
  ENABLED: boolean;
  URI: string;
  EXCHANGE_NAME: string;
  GLOBAL_ENABLED: boolean;
  EVENTS: EventsRabbitmq;
  PREFIX_KEY?: string;
};

export type Nats = {
  ENABLED: boolean;
  URI: string;
  EXCHANGE_NAME: string;
  GLOBAL_ENABLED: boolean;
  EVENTS: EventsRabbitmq;
  PREFIX_KEY?: string;
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
  MESSAGES_EDITED: boolean;
  MESSAGES_UPDATE: boolean;
  MESSAGES_DELETE: boolean;
  SEND_MESSAGE: boolean;
  SEND_MESSAGE_UPDATE: boolean;
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
  TYPEBOT_START: boolean;
  TYPEBOT_CHANGE_STATUS: boolean;
  ERRORS: boolean;
  ERRORS_WEBHOOK: string;
};

export type EventsPusher = {
  APPLICATION_STARTUP: boolean;
  INSTANCE_CREATE: boolean;
  INSTANCE_DELETE: boolean;
  QRCODE_UPDATED: boolean;
  MESSAGES_SET: boolean;
  MESSAGES_UPSERT: boolean;
  MESSAGES_EDITED: boolean;
  MESSAGES_UPDATE: boolean;
  MESSAGES_DELETE: boolean;
  SEND_MESSAGE: boolean;
  SEND_MESSAGE_UPDATE: boolean;
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
  TYPEBOT_START: boolean;
  TYPEBOT_CHANGE_STATUS: boolean;
};

export type ApiKey = { KEY: string };

export type Auth = {
  API_KEY: ApiKey;
  EXPOSE_IN_FETCH_INSTANCES: boolean;
};

export type DelInstance = number | boolean;

export type Language = string | 'en';

export type GlobalWebhook = {
  URL: string;
  ENABLED: boolean;
  WEBHOOK_BY_EVENTS: boolean;
};

export type GlobalPusher = {
  ENABLED: boolean;
  APP_ID: string;
  KEY: string;
  SECRET: string;
  CLUSTER: string;
  USE_TLS: boolean;
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
export type Pusher = { ENABLED: boolean; GLOBAL?: GlobalPusher; EVENTS: EventsPusher };
export type ConfigSessionPhone = { CLIENT: string; NAME: string; VERSION: string };
export type QrCode = { LIMIT: number; COLOR: string };
export type Typebot = { ENABLED: boolean; API_VERSION: string; SEND_MEDIA_BASE64: boolean };
export type Chatwoot = {
  ENABLED: boolean;
  MESSAGE_DELETE: boolean;
  MESSAGE_READ: boolean;
  BOT_CONTACT: boolean;
  IMPORT: {
    DATABASE: {
      CONNECTION: {
        URI: string;
      };
    };
    PLACEHOLDER_MEDIA_MESSAGE: boolean;
  };
};
export type Openai = { ENABLED: boolean; API_KEY_GLOBAL?: string };
export type Dify = { ENABLED: boolean };

export type S3 = {
  ACCESS_KEY: string;
  SECRET_KEY: string;
  ENDPOINT: string;
  BUCKET_NAME: string;
  ENABLE: boolean;
  PORT?: number;
  USE_SSL?: boolean;
  REGION?: string;
  SKIP_POLICY?: boolean;
};

export type CacheConf = { REDIS: CacheConfRedis; LOCAL: CacheConfLocal };
export type Production = boolean;

export interface Env {
  SERVER: HttpServer;
  CORS: Cors;
  SSL_CONF: SslConf;
  PROVIDER: ProviderSession;
  DATABASE: Database;
  RABBITMQ: Rabbitmq;
  NATS: Nats;
  SQS: Sqs;
  WEBSOCKET: Websocket;
  WA_BUSINESS: WaBusiness;
  LOG: Log;
  DEL_INSTANCE: DelInstance;
  DEL_TEMP_INSTANCES: boolean;
  LANGUAGE: Language;
  WEBHOOK: Webhook;
  PUSHER: Pusher;
  CONFIG_SESSION_PHONE: ConfigSessionPhone;
  QRCODE: QrCode;
  TYPEBOT: Typebot;
  CHATWOOT: Chatwoot;
  OPENAI: Openai;
  DIFY: Dify;
  CACHE: CacheConf;
  S3?: S3;
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
    this.env = this.envProcess();
    this.env.PRODUCTION = process.env?.NODE_ENV === 'PROD';
    if (process.env?.DOCKER_ENV === 'true') {
      this.env.SERVER.TYPE = process.env.SERVER_TYPE as 'http' | 'http';
      this.env.SERVER.PORT = Number.parseInt(process.env.SERVER_PORT) || 8080;
    }
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
        ORIGIN: process.env.CORS_ORIGIN?.split(',') || ['*'],
        METHODS:
          (process.env.CORS_METHODS?.split(',') as HttpMethods[]) ||
          (['POST', 'GET', 'PUT', 'DELETE'] as HttpMethods[]),
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
      DATABASE: {
        CONNECTION: {
          URI: process.env.DATABASE_CONNECTION_URI || '',
          CLIENT_NAME: process.env.DATABASE_CONNECTION_CLIENT_NAME || 'evolution',
        },
        PROVIDER: process.env.DATABASE_PROVIDER || 'postgresql',
        SAVE_DATA: {
          INSTANCE: process.env?.DATABASE_SAVE_DATA_INSTANCE === 'true',
          NEW_MESSAGE: process.env?.DATABASE_SAVE_DATA_NEW_MESSAGE === 'true',
          MESSAGE_UPDATE: process.env?.DATABASE_SAVE_MESSAGE_UPDATE === 'true',
          CONTACTS: process.env?.DATABASE_SAVE_DATA_CONTACTS === 'true',
          CHATS: process.env?.DATABASE_SAVE_DATA_CHATS === 'true',
          HISTORIC: process.env?.DATABASE_SAVE_DATA_HISTORIC === 'true',
          LABELS: process.env?.DATABASE_SAVE_DATA_LABELS === 'true',
          IS_ON_WHATSAPP: process.env?.DATABASE_SAVE_IS_ON_WHATSAPP === 'true',
          IS_ON_WHATSAPP_DAYS: Number.parseInt(process.env?.DATABASE_SAVE_IS_ON_WHATSAPP_DAYS ?? '7'),
        },
        DELETE_DATA: {
          LOGICAL_MESSAGE_DELETE: process.env?.DATABASE_DELETE_MESSAGE === 'true',
        },
      },
      RABBITMQ: {
        ENABLED: process.env?.RABBITMQ_ENABLED === 'true',
        GLOBAL_ENABLED: process.env?.RABBITMQ_GLOBAL_ENABLED === 'true',
        PREFIX_KEY: process.env?.RABBITMQ_PREFIX_KEY,
        EXCHANGE_NAME: process.env?.RABBITMQ_EXCHANGE_NAME || 'evolution_exchange',
        URI: process.env.RABBITMQ_URI || '',
        EVENTS: {
          APPLICATION_STARTUP: process.env?.RABBITMQ_EVENTS_APPLICATION_STARTUP === 'true',
          INSTANCE_CREATE: process.env?.RABBITMQ_EVENTS_INSTANCE_CREATE === 'true',
          INSTANCE_DELETE: process.env?.RABBITMQ_EVENTS_INSTANCE_DELETE === 'true',
          QRCODE_UPDATED: process.env?.RABBITMQ_EVENTS_QRCODE_UPDATED === 'true',
          MESSAGES_SET: process.env?.RABBITMQ_EVENTS_MESSAGES_SET === 'true',
          MESSAGES_UPSERT: process.env?.RABBITMQ_EVENTS_MESSAGES_UPSERT === 'true',
          MESSAGES_EDITED: process.env?.RABBITMQ_EVENTS_MESSAGES_EDITED === 'true',
          MESSAGES_UPDATE: process.env?.RABBITMQ_EVENTS_MESSAGES_UPDATE === 'true',
          MESSAGES_DELETE: process.env?.RABBITMQ_EVENTS_MESSAGES_DELETE === 'true',
          SEND_MESSAGE: process.env?.RABBITMQ_EVENTS_SEND_MESSAGE === 'true',
          SEND_MESSAGE_UPDATE: process.env?.RABBITMQ_EVENTS_SEND_MESSAGE_UPDATE === 'true',
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
          TYPEBOT_START: process.env?.RABBITMQ_EVENTS_TYPEBOT_START === 'true',
          TYPEBOT_CHANGE_STATUS: process.env?.RABBITMQ_EVENTS_TYPEBOT_CHANGE_STATUS === 'true',
        },
      },
      NATS: {
        ENABLED: process.env?.NATS_ENABLED === 'true',
        GLOBAL_ENABLED: process.env?.NATS_GLOBAL_ENABLED === 'true',
        PREFIX_KEY: process.env?.NATS_PREFIX_KEY,
        EXCHANGE_NAME: process.env?.NATS_EXCHANGE_NAME || 'evolution_exchange',
        URI: process.env.NATS_URI || '',
        EVENTS: {
          APPLICATION_STARTUP: process.env?.NATS_EVENTS_APPLICATION_STARTUP === 'true',
          INSTANCE_CREATE: process.env?.NATS_EVENTS_INSTANCE_CREATE === 'true',
          INSTANCE_DELETE: process.env?.NATS_EVENTS_INSTANCE_DELETE === 'true',
          QRCODE_UPDATED: process.env?.NATS_EVENTS_QRCODE_UPDATED === 'true',
          MESSAGES_SET: process.env?.NATS_EVENTS_MESSAGES_SET === 'true',
          MESSAGES_UPSERT: process.env?.NATS_EVENTS_MESSAGES_UPSERT === 'true',
          MESSAGES_EDITED: process.env?.NATS_EVENTS_MESSAGES_EDITED === 'true',
          MESSAGES_UPDATE: process.env?.NATS_EVENTS_MESSAGES_UPDATE === 'true',
          MESSAGES_DELETE: process.env?.NATS_EVENTS_MESSAGES_DELETE === 'true',
          SEND_MESSAGE: process.env?.NATS_EVENTS_SEND_MESSAGE === 'true',
          SEND_MESSAGE_UPDATE: process.env?.NATS_EVENTS_SEND_MESSAGE_UPDATE === 'true',
          CONTACTS_SET: process.env?.NATS_EVENTS_CONTACTS_SET === 'true',
          CONTACTS_UPDATE: process.env?.NATS_EVENTS_CONTACTS_UPDATE === 'true',
          CONTACTS_UPSERT: process.env?.NATS_EVENTS_CONTACTS_UPSERT === 'true',
          PRESENCE_UPDATE: process.env?.NATS_EVENTS_PRESENCE_UPDATE === 'true',
          CHATS_SET: process.env?.NATS_EVENTS_CHATS_SET === 'true',
          CHATS_UPDATE: process.env?.NATS_EVENTS_CHATS_UPDATE === 'true',
          CHATS_UPSERT: process.env?.NATS_EVENTS_CHATS_UPSERT === 'true',
          CHATS_DELETE: process.env?.NATS_EVENTS_CHATS_DELETE === 'true',
          CONNECTION_UPDATE: process.env?.NATS_EVENTS_CONNECTION_UPDATE === 'true',
          LABELS_EDIT: process.env?.NATS_EVENTS_LABELS_EDIT === 'true',
          LABELS_ASSOCIATION: process.env?.NATS_EVENTS_LABELS_ASSOCIATION === 'true',
          GROUPS_UPSERT: process.env?.NATS_EVENTS_GROUPS_UPSERT === 'true',
          GROUP_UPDATE: process.env?.NATS_EVENTS_GROUPS_UPDATE === 'true',
          GROUP_PARTICIPANTS_UPDATE: process.env?.NATS_EVENTS_GROUP_PARTICIPANTS_UPDATE === 'true',
          CALL: process.env?.NATS_EVENTS_CALL === 'true',
          TYPEBOT_START: process.env?.NATS_EVENTS_TYPEBOT_START === 'true',
          TYPEBOT_CHANGE_STATUS: process.env?.NATS_EVENTS_TYPEBOT_CHANGE_STATUS === 'true',
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
      PUSHER: {
        ENABLED: process.env?.PUSHER_ENABLED === 'true',
        GLOBAL: {
          ENABLED: process.env?.PUSHER_GLOBAL_ENABLED === 'true',
          APP_ID: process.env?.PUSHER_GLOBAL_APP_ID || '',
          KEY: process.env?.PUSHER_GLOBAL_KEY || '',
          SECRET: process.env?.PUSHER_GLOBAL_SECRET || '',
          CLUSTER: process.env?.PUSHER_GLOBAL_CLUSTER || '',
          USE_TLS: process.env?.PUSHER_GLOBAL_USE_TLS === 'true',
        },
        EVENTS: {
          APPLICATION_STARTUP: process.env?.PUSHER_EVENTS_APPLICATION_STARTUP === 'true',
          INSTANCE_CREATE: process.env?.PUSHER_EVENTS_INSTANCE_CREATE === 'true',
          INSTANCE_DELETE: process.env?.PUSHER_EVENTS_INSTANCE_DELETE === 'true',
          QRCODE_UPDATED: process.env?.PUSHER_EVENTS_QRCODE_UPDATED === 'true',
          MESSAGES_SET: process.env?.PUSHER_EVENTS_MESSAGES_SET === 'true',
          MESSAGES_UPSERT: process.env?.PUSHER_EVENTS_MESSAGES_UPSERT === 'true',
          MESSAGES_EDITED: process.env?.PUSHER_EVENTS_MESSAGES_EDITED === 'true',
          MESSAGES_UPDATE: process.env?.PUSHER_EVENTS_MESSAGES_UPDATE === 'true',
          MESSAGES_DELETE: process.env?.PUSHER_EVENTS_MESSAGES_DELETE === 'true',
          SEND_MESSAGE: process.env?.PUSHER_EVENTS_SEND_MESSAGE === 'true',
          SEND_MESSAGE_UPDATE: process.env?.PUSHER_EVENTS_SEND_MESSAGE_UPDATE === 'true',
          CONTACTS_SET: process.env?.PUSHER_EVENTS_CONTACTS_SET === 'true',
          CONTACTS_UPDATE: process.env?.PUSHER_EVENTS_CONTACTS_UPDATE === 'true',
          CONTACTS_UPSERT: process.env?.PUSHER_EVENTS_CONTACTS_UPSERT === 'true',
          PRESENCE_UPDATE: process.env?.PUSHER_EVENTS_PRESENCE_UPDATE === 'true',
          CHATS_SET: process.env?.PUSHER_EVENTS_CHATS_SET === 'true',
          CHATS_UPDATE: process.env?.PUSHER_EVENTS_CHATS_UPDATE === 'true',
          CHATS_UPSERT: process.env?.PUSHER_EVENTS_CHATS_UPSERT === 'true',
          CHATS_DELETE: process.env?.PUSHER_EVENTS_CHATS_DELETE === 'true',
          CONNECTION_UPDATE: process.env?.PUSHER_EVENTS_CONNECTION_UPDATE === 'true',
          LABELS_EDIT: process.env?.PUSHER_EVENTS_LABELS_EDIT === 'true',
          LABELS_ASSOCIATION: process.env?.PUSHER_EVENTS_LABELS_ASSOCIATION === 'true',
          GROUPS_UPSERT: process.env?.PUSHER_EVENTS_GROUPS_UPSERT === 'true',
          GROUP_UPDATE: process.env?.PUSHER_EVENTS_GROUPS_UPDATE === 'true',
          GROUP_PARTICIPANTS_UPDATE: process.env?.PUSHER_EVENTS_GROUP_PARTICIPANTS_UPDATE === 'true',
          CALL: process.env?.PUSHER_EVENTS_CALL === 'true',
          TYPEBOT_START: process.env?.PUSHER_EVENTS_TYPEBOT_START === 'true',
          TYPEBOT_CHANGE_STATUS: process.env?.PUSHER_EVENTS_TYPEBOT_CHANGE_STATUS === 'true',
        },
      },
      WA_BUSINESS: {
        TOKEN_WEBHOOK: process.env.WA_BUSINESS_TOKEN_WEBHOOK || 'evolution',
        URL: process.env.WA_BUSINESS_URL || 'https://graph.facebook.com',
        VERSION: process.env.WA_BUSINESS_VERSION || 'v18.0',
        LANGUAGE: process.env.WA_BUSINESS_LANGUAGE || 'en',
      },
      LOG: {
        LEVEL:
          (process.env?.LOG_LEVEL?.split(',') as LogLevel[]) ||
          (['ERROR', 'WARN', 'DEBUG', 'INFO', 'LOG', 'VERBOSE', 'DARK', 'WEBHOOKS', 'WEBSOCKET'] as LogLevel[]),
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
          MESSAGES_EDITED: process.env?.WEBHOOK_EVENTS_MESSAGES_EDITED === 'true',
          MESSAGES_UPDATE: process.env?.WEBHOOK_EVENTS_MESSAGES_UPDATE === 'true',
          MESSAGES_DELETE: process.env?.WEBHOOK_EVENTS_MESSAGES_DELETE === 'true',
          SEND_MESSAGE: process.env?.WEBHOOK_EVENTS_SEND_MESSAGE === 'true',
          SEND_MESSAGE_UPDATE: process.env?.WEBHOOK_EVENTS_SEND_MESSAGE_UPDATE === 'true',
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
          TYPEBOT_START: process.env?.WEBHOOK_EVENTS_TYPEBOT_START === 'true',
          TYPEBOT_CHANGE_STATUS: process.env?.WEBHOOK_EVENTS_TYPEBOT_CHANGE_STATUS === 'true',
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
        ENABLED: process.env?.TYPEBOT_ENABLED === 'true',
        API_VERSION: process.env?.TYPEBOT_API_VERSION || 'old',
        SEND_MEDIA_BASE64: process.env?.TYPEBOT_SEND_MEDIA_BASE64 === 'true',
      },
      CHATWOOT: {
        ENABLED: process.env?.CHATWOOT_ENABLED === 'true',
        MESSAGE_DELETE: process.env.CHATWOOT_MESSAGE_DELETE === 'true',
        MESSAGE_READ: process.env.CHATWOOT_MESSAGE_READ === 'true',
        BOT_CONTACT: !process.env.CHATWOOT_BOT_CONTACT || process.env.CHATWOOT_BOT_CONTACT === 'true',
        IMPORT: {
          DATABASE: {
            CONNECTION: {
              URI: process.env.CHATWOOT_IMPORT_DATABASE_CONNECTION_URI || '',
            },
          },
          PLACEHOLDER_MEDIA_MESSAGE: process.env?.CHATWOOT_IMPORT_PLACEHOLDER_MEDIA_MESSAGE === 'true',
        },
      },
      OPENAI: {
        ENABLED: process.env?.OPENAI_ENABLED === 'true',
        API_KEY_GLOBAL: process.env?.OPENAI_API_KEY_GLOBAL || null,
      },
      DIFY: {
        ENABLED: process.env?.DIFY_ENABLED === 'true',
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
      S3: {
        ACCESS_KEY: process.env?.S3_ACCESS_KEY,
        SECRET_KEY: process.env?.S3_SECRET_KEY,
        ENDPOINT: process.env?.S3_ENDPOINT,
        BUCKET_NAME: process.env?.S3_BUCKET,
        ENABLE: process.env?.S3_ENABLED === 'true',
        PORT: Number.parseInt(process.env?.S3_PORT || '9000'),
        USE_SSL: process.env?.S3_USE_SSL === 'true',
        REGION: process.env?.S3_REGION,
        SKIP_POLICY: process.env?.S3_SKIP_POLICY === 'true',
      },
      AUTHENTICATION: {
        API_KEY: {
          KEY: process.env.AUTHENTICATION_API_KEY || 'BQYHJGJHJ',
        },
        EXPOSE_IN_FETCH_INSTANCES: process.env?.AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES === 'true',
      },
    };
  }
}

export const configService = new ConfigService();
