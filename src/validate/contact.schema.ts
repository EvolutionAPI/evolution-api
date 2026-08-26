import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

export const saveContactSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: {
      type: 'string',
      minLength: 8,
      maxLength: 20,
      pattern: '^[0-9]+$',
      description: 'The "number" must contain only digits (8-20 characters)',
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'The "name" cannot be empty',
    },
    firstName: {
      type: 'string',
      maxLength: 50,
    },
    saveOnDevice: {
      type: 'boolean',
    },
  },
  required: ['number', 'name'],
};
