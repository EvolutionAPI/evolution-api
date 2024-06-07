import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

import { Events, isNotEmpty } from './validate.schema';

export const websocketSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean', enum: [true, false] },
    events: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: Events,
      },
    },
  },
  required: ['enabled'],
  ...isNotEmpty('enabled'),
};
