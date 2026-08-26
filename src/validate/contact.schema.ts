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

export const saveContactSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { type: 'string' },
    name: { type: 'string' },
    firstName: { type: 'string' },
    saveOnDevice: { type: 'boolean' },
  },
  required: ['number', 'name'],
  ...isNotEmpty('number', 'name'),
};
