// Integrations Schema
// TODO: rever todas as integrações e garantir o funcionamento perfeito
export * from '../api/integrations/chatwoot/validate/chatwoot.schema';
export * from '../api/integrations/rabbitmq/validate/rabbitmq.schema';
export * from '../api/integrations/sqs/validate/sqs.schema';
export * from '../api/integrations/typebot/validate/typebot.schema';

// Instance Schema
export * from './chat.schema';
export * from './group.schema';
export * from './instance.schema';
export * from './label.schema';
export * from './message.schema';
export * from './proxy.schema';
export * from './settings.schema';
export * from './webhook.schema';
export * from './websocket.schema';

export const Events = [
  'APPLICATION_STARTUP',
  'QRCODE_UPDATED',
  'MESSAGES_SET',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'SEND_MESSAGE',
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
];
