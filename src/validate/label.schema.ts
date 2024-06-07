import { JSONSchema7, JSONSchema7Definition } from 'json-schema';
import { v4 } from 'uuid';

import { isNotEmpty } from './validate.schema';

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
