import { JSONSchema7 } from 'json-schema';

export const n8nSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    description: { type: 'string' },
    webhookUrl: { type: 'string', minLength: 1 },
    basicAuthUser: { type: 'string' },
    basicAuthPass: { type: 'string' },
  },
  required: ['enabled', 'webhookUrl'],
};

export const n8nMessageSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    chatInput: { type: 'string', minLength: 1 },
    sessionId: { type: 'string', minLength: 1 },
  },
  required: ['chatInput', 'sessionId'],
};

export const n8nSettingSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    expire: { type: 'number' },
    keywordFinish: { type: 'string' },
    delayMessage: { type: 'number' },
    unknownMessage: { type: 'string' },
    listeningFromMe: { type: 'boolean' },
    stopBotFromMe: { type: 'boolean' },
    keepOpen: { type: 'boolean' },
    debounceTime: { type: 'number' },
    n8nIdFallback: { type: 'string' },
    ignoreJids: { type: 'array', items: { type: 'string' } },
    splitMessages: { type: 'boolean' },
    timePerChar: { type: 'number' },
  },
  required: [],
};

export const n8nStatusSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    remoteJid: { type: 'string' },
    status: { type: 'string', enum: ['opened', 'closed', 'delete', 'paused'] },
  },
  required: ['remoteJid', 'status'],
};

export const n8nIgnoreJidSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    remoteJid: { type: 'string' },
    action: { type: 'string', enum: ['add', 'remove'] },
  },
  required: ['remoteJid', 'action'],
};
