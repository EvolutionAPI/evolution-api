import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

import { isNotEmpty } from './validate.schema';

export const proxySchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean', enum: [true, false] },
    host: { type: 'string' },
    port: { type: 'string' },
    protocol: { type: 'string' },
    username: { type: 'string' },
    password: { type: 'string' },
  },
  required: ['enabled', 'host', 'port', 'protocol'],
  ...isNotEmpty('enabled', 'host', 'port', 'protocol'),
};
