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

export const openaiSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    description: { type: 'string' },
    openaiCredsId: { type: 'string' },
    botType: { type: 'string', enum: ['assistant', 'chatCompletion'] },
    assistantId: { type: 'string' },
    functionUrl: { type: 'string' },
    model: { type: 'string' },
    systemMessages: { type: 'array', items: { type: 'string' } },
    assistantMessages: { type: 'array', items: { type: 'string' } },
    userMessages: { type: 'array', items: { type: 'string' } },
    maxTokens: { type: 'integer' },
    triggerType: { type: 'string', enum: ['all', 'keyword', 'none'] },
    triggerOperator: { type: 'string', enum: ['equals', 'contains', 'startsWith', 'endsWith', 'regex'] },
    triggerValue: { type: 'string' },
    expire: { type: 'integer' },
    keywordFinish: { type: 'string' },
    delayMessage: { type: 'integer' },
    unknownMessage: { type: 'string' },
    listeningFromMe: { type: 'boolean' },
    stopBotFromMe: { type: 'boolean' },
    keepOpen: { type: 'boolean' },
    debounceTime: { type: 'integer' },
    ignoreJids: { type: 'array', items: { type: 'string' } },
  },
  required: ['enabled', 'openaiCredsId', 'botType', 'triggerType'],
  ...isNotEmpty('enabled', 'openaiCredsId', 'botType', 'triggerType'),
};

export const openaiCredsSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    name: { type: 'string' },
    apiKey: { type: 'string' },
  },
  required: ['name', 'apiKey'],
  ...isNotEmpty('name', 'apiKey'),
};

export const openaiStatusSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    remoteJid: { type: 'string' },
    status: { type: 'string', enum: ['opened', 'closed', 'paused', 'delete'] },
  },
  required: ['remoteJid', 'status'],
  ...isNotEmpty('remoteJid', 'status'),
};

export const openaiSettingSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    openaiCredsId: { type: 'string' },
    expire: { type: 'integer' },
    keywordFinish: { type: 'string' },
    delayMessage: { type: 'integer' },
    unknownMessage: { type: 'string' },
    listeningFromMe: { type: 'boolean' },
    stopBotFromMe: { type: 'boolean' },
    keepOpen: { type: 'boolean' },
    debounceTime: { type: 'integer' },
    speechToText: { type: 'boolean' },
    ignoreJids: { type: 'array', items: { type: 'string' } },
    openaiIdFallback: { type: 'string' },
  },
  required: [
    'openaiCredsId',
    'expire',
    'keywordFinish',
    'delayMessage',
    'unknownMessage',
    'listeningFromMe',
    'stopBotFromMe',
    'keepOpen',
    'debounceTime',
    'ignoreJids',
  ],
  ...isNotEmpty(
    'openaiCredsId',
    'expire',
    'keywordFinish',
    'delayMessage',
    'unknownMessage',
    'listeningFromMe',
    'stopBotFromMe',
    'keepOpen',
    'debounceTime',
    'ignoreJids',
  ),
};

export const openaiIgnoreJidSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    remoteJid: { type: 'string' },
    action: { type: 'string', enum: ['add', 'remove'] },
  },
  required: ['remoteJid', 'action'],
  ...isNotEmpty('remoteJid', 'action'),
};
