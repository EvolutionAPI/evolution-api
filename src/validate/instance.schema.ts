import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

import { Integration } from '../api/types/wa.types';
import { Events } from './validate.schema';

const isNotEmpty = (...propertyNames: string[]): JSONSchema7 => {
  const properties = {};
  propertyNames.forEach(
    (property) =>
      (properties[property] = {
        minLength: 1,
        description: `The "${property}" cannot be empty`,
      }),
  );
  return {
    if: {
      propertyNames: {
        enum: [...propertyNames],
      },
    },
    then: { properties },
  };
};

export const instanceSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    // Instance
    instanceName: { type: 'string' },
    token: { type: 'string' },
    number: { type: 'string', pattern: '^\\d+[\\.@\\w-]+' },
    qrcode: { type: 'boolean' },
    Integration: {
      type: 'string',
      enum: Object.values(Integration),
    },
    // Settings
    rejectCall: { type: 'boolean' },
    msgCall: { type: 'string' },
    groupsIgnore: { type: 'boolean' },
    alwaysOnline: { type: 'boolean' },
    readMessages: { type: 'boolean' },
    readStatus: { type: 'boolean' },
    syncFullHistory: { type: 'boolean' },
    // Proxy
    proxyHost: { type: 'string' },
    proxyPort: { type: 'string' },
    proxyProtocol: { type: 'string' },
    proxyUsername: { type: 'string' },
    proxyPassword: { type: 'string' },
    // Webhook
    webhookUrl: { type: 'string' },
    webhookByEvents: { type: 'boolean' },
    webhookBase64: { type: 'boolean' },
    webhookEvents: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: Events,
      },
    },
    // RabbitMQ
    rabbitmqEnabled: { type: 'boolean' },
    rabbitmqEvents: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: Events,
      },
    },
    // SQS
    sqsEnabled: { type: 'boolean' },
    sqsEvents: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: Events,
      },
    },
    // Chatwoot
    chatwootAccountId: { type: 'string' },
    chatwootToken: { type: 'string' },
    chatwootUrl: { type: 'string' },
    chatwootSignMsg: { type: 'boolean' },
    chatwootReopenConversation: { type: 'boolean' },
    chatwootConversationPending: { type: 'boolean' },
    chatwootImportContacts: { type: 'boolean' },
    chatwootNameInbox: { type: 'string' },
    chatwootMergeBrazilContacts: { type: 'boolean' },
    chatwootImportMessages: { type: 'boolean' },
    chatwootDaysLimitImportMessages: { type: 'number' },
    // Typebot
    typebotUrl: { type: 'string' },
    typebot: { type: 'boolean' },
    typebotExpire: { type: 'number' },
    typebotKeywordFinish: { type: 'string' },
    typebotDelayMessage: { type: 'number' },
    typebotUnknownMessage: { type: 'string' },
    typebotListeningFromMe: { type: 'boolean' },
  },
  ...isNotEmpty('instanceName'),
};

export const presenceOnlySchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    presence: {
      type: 'string',
      enum: ['unavailable', 'available', 'composing', 'recording', 'paused'],
    },
  },
  required: ['presence'],
};
