import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

import { Events, isNotEmpty } from './validate.schema';

export const webhookSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    url: { type: 'string' },
    webhookByEvents: { type: 'boolean' },
    webhookBase64: { type: 'boolean' },
    events: {
      type: 'array',
      minItems: 0,
      items: {
        type: 'string',
        enum: Events,
      },
    },
  },
  required: ['enabled', 'url'],
  ...isNotEmpty('enabled', 'url'),
};
