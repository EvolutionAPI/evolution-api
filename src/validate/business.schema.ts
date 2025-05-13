import { JSONSchema7 } from 'json-schema';

export const catalogSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    number: { type: 'string' },
    limit: { type: 'number' },
  },
};

export const collectionsSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    number: { type: 'string' },
    limit: { type: 'number' },
  },
};
