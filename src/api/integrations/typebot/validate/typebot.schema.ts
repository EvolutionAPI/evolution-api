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
    url: { type: 'string' },
    typebot: { type: 'string' },
    triggerType: { type: 'string', enum: ['all', 'keyword'] },
    triggerOperator: { type: 'string', enum: ['equals', 'contains', 'startsWith', 'endsWith'] },
    triggerValue: { type: 'string' },
    expire: { type: 'integer' },
    keywordFinish: { type: 'string' },
    delayMessage: { type: 'integer' },
    unknownMessage: { type: 'string' },
    listeningFromMe: { type: 'boolean' },
    stopBotFromMe: { type: 'boolean' },
  },
  required: ['enabled', 'url', 'typebot', 'triggerType'],
  ...isNotEmpty('enabled', 'url', 'typebot', 'triggerType'),
};

export const typebotStatusSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    remoteJid: { type: 'string' },
    status: { type: 'string', enum: ['opened', 'closed', 'paused'] },
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
  },
  required: ['expire', 'keywordFinish', 'delayMessage', 'unknownMessage', 'listeningFromMe', 'stopBotFromMe'],
  ...isNotEmpty('expire', 'keywordFinish', 'delayMessage', 'unknownMessage', 'listeningFromMe', 'stopBotFromMe'),
};
