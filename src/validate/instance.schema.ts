import { Integration } from '@api/types/wa.types';
import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

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
    businessId: { type: 'string' },
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
    wavoipToken: { type: 'string' },
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
        enum: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'MESSAGES_SET',
          'MESSAGES_UPSERT',
          'MESSAGES_EDITED',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'SEND_MESSAGE_UPDATE',
          'CONTACTS_SET',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'PRESENCE_UPDATE',
          'CHATS_SET',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'GROUP_PARTICIPANTS_UPDATE',
          'CONNECTION_UPDATE',
          'LABELS_EDIT',
          'LABELS_ASSOCIATION',
          'CALL',
          'TYPEBOT_START',
          'TYPEBOT_CHANGE_STATUS',
        ],
      },
    },
    // RabbitMQ
    rabbitmqEnabled: { type: 'boolean' },
    rabbitmqEvents: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'MESSAGES_SET',
          'MESSAGES_UPSERT',
          'MESSAGES_EDITED',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'SEND_MESSAGE_UPDATE',
          'CONTACTS_SET',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'PRESENCE_UPDATE',
          'CHATS_SET',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'GROUP_PARTICIPANTS_UPDATE',
          'CONNECTION_UPDATE',
          'LABELS_EDIT',
          'LABELS_ASSOCIATION',
          'CALL',
          'TYPEBOT_START',
          'TYPEBOT_CHANGE_STATUS',
        ],
      },
    },
    // NATS
    natsEnabled: { type: 'boolean' },
    natsEvents: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'MESSAGES_SET',
          'MESSAGES_UPSERT',
          'MESSAGES_EDITED',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'SEND_MESSAGE_UPDATE',
          'CONTACTS_SET',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'PRESENCE_UPDATE',
          'CHATS_SET',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'GROUP_PARTICIPANTS_UPDATE',
          'CONNECTION_UPDATE',
          'LABELS_EDIT',
          'LABELS_ASSOCIATION',
          'CALL',
          'TYPEBOT_START',
          'TYPEBOT_CHANGE_STATUS',
        ],
      },
    },
    // SQS
    sqsEnabled: { type: 'boolean' },
    sqsEvents: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'MESSAGES_SET',
          'MESSAGES_UPSERT',
          'MESSAGES_EDITED',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'SEND_MESSAGE_UPDATE',
          'CONTACTS_SET',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'PRESENCE_UPDATE',
          'CHATS_SET',
          'CHATS_UPSERT',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'GROUP_PARTICIPANTS_UPDATE',
          'CONNECTION_UPDATE',
          'LABELS_EDIT',
          'LABELS_ASSOCIATION',
          'CALL',
          'TYPEBOT_START',
          'TYPEBOT_CHANGE_STATUS',
        ],
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
