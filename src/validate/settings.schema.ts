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
