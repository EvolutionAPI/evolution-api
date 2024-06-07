import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

import { isNotEmpty } from './validate.schema';

export const settingsSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    rejectCall: { type: 'boolean' },
    msgCall: { type: 'string' },
    groupsIgnore: { type: 'boolean' },
    alwaysOnline: { type: 'boolean' },
    readMessages: { type: 'boolean' },
    readStatus: { type: 'boolean' },
    syncFullHistory: { type: 'boolean' },
  },
  required: ['rejectCall', 'groupsIgnore', 'alwaysOnline', 'readMessages', 'readStatus', 'syncFullHistory'],
  ...isNotEmpty('rejectCall', 'groupsIgnore', 'alwaysOnline', 'readMessages', 'readStatus', 'syncFullHistory'),
};
