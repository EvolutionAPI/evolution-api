import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

import { EventController } from '../event.controller';
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
export const pusherSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    pusher: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        appId: { type: 'string' },
        key: { type: 'string' },
        secret: { type: 'string' },
        cluster: { type: 'string' },
        useTLS: { type: 'boolean' },
        events: {
          type: 'array',
          minItems: 0,
          items: {
            type: 'string',
            enum: EventController.events,
          },
        },
      },
      required: ['enabled', 'appId', 'key', 'secret', 'cluster', 'useTLS'],
      ...isNotEmpty('enabled', 'appId', 'key', 'secret', 'cluster', 'useTLS'),
    },
  },
  required: ['pusher'],
};
