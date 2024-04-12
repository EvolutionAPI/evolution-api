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
    enabled: { type: 'boolean', enum: [true, false] },
    url: { type: 'string' },
    typebot: { type: 'string' },
    expire: { type: 'integer' },
    delay_message: { type: 'integer' },
    unknown_message: { type: 'string' },
    listening_from_me: { type: 'boolean', enum: [true, false] },
  },
  required: ['enabled', 'url', 'typebot', 'expire', 'delay_message', 'unknown_message', 'listening_from_me'],
  ...isNotEmpty('enabled', 'url', 'typebot', 'expire', 'delay_message', 'unknown_message', 'listening_from_me'),
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
