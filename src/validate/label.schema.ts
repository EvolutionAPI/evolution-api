import { JSONSchema7, JSONSchema7Definition } from 'json-schema';
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

const numberDefinition: JSONSchema7Definition = {
  type: 'string',
  description: 'Invalid format',
};

export const handleLabelSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    number: { ...numberDefinition },
    labelId: { type: 'string' },
    action: { type: 'string', enum: ['add', 'remove'] },
  },
  required: ['number', 'labelId', 'action'],
  ...isNotEmpty('number', 'labelId', 'action'),
};
