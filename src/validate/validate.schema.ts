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
