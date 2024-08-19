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

export const typebotSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    description: { type: 'string' },
    url: { type: 'string' },
    typebot: { type: 'string' },
    triggerType: { type: 'string', enum: ['all', 'keyword', 'none', 'advanced'] },
    triggerOperator: { type: 'string', enum: ['equals', 'contains', 'startsWith', 'endsWith', 'regex'] },
    triggerValue: { type: 'string' },
    expire: { type: 'integer' },
    keywordFinish: { type: 'string' },
    delayMessage: { type: 'integer' },
    unknownMessage: { type: 'string' },
    listeningFromMe: { type: 'boolean' },
    stopBotFromMe: { type: 'boolean' },
    ignoreJids: { type: 'array', items: { type: 'string' } },
  },
  required: ['enabled', 'url', 'typebot', 'triggerType'],
  ...isNotEmpty('enabled', 'url', 'typebot', 'triggerType'),
};

export const typebotStatusSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    remoteJid: { type: 'string' },
    status: { type: 'string', enum: ['opened', 'closed', 'paused', 'delete'] },
  },
  required: ['remoteJid', 'status'],
  ...isNotEmpty('remoteJid', 'status'),
};

export const typebotStartSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    remoteJid: { type: 'string' },
    url: { type: 'string' },
    typebot: { type: 'string' },
  },
  required: ['remoteJid', 'url', 'typebot'],
  ...isNotEmpty('remoteJid', 'url', 'typebot'),
};

export const typebotSettingSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    expire: { type: 'integer' },
    keywordFinish: { type: 'string' },
    delayMessage: { type: 'integer' },
    unknownMessage: { type: 'string' },
    listeningFromMe: { type: 'boolean' },
    stopBotFromMe: { type: 'boolean' },
    keepOpen: { type: 'boolean' },
    debounceTime: { type: 'integer' },
    typebotIdFallback: { type: 'string' },
    ignoreJids: { type: 'array', items: { type: 'string' } },
  },
  required: ['expire', 'keywordFinish', 'delayMessage', 'unknownMessage', 'listeningFromMe', 'stopBotFromMe'],
  ...isNotEmpty('expire', 'keywordFinish', 'delayMessage', 'unknownMessage', 'listeningFromMe', 'stopBotFromMe'),
};

export const typebotIgnoreJidSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    remoteJid: { type: 'string' },
    action: { type: 'string', enum: ['add', 'remove'] },
  },
  required: ['remoteJid', 'action'],
  ...isNotEmpty('remoteJid', 'action'),
};
