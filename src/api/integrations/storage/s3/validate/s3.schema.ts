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

export const s3Schema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    messageId: { type: 'integer' },
  },
  ...isNotEmpty('id', 'type', 'messageId'),
};

export const s3UrlSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    id: { type: 'string', pattern: '\\d+', minLength: 1 },
    expiry: { type: 'string', pattern: '\\d+', minLength: 1 },
  },
  ...isNotEmpty('id'),
  required: ['id'],
};
