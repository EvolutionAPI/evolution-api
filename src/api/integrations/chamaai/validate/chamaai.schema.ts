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

export const chamaaiSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean', enum: [true, false] },
    url: { type: 'string' },
    token: { type: 'string' },
    waNumber: { type: 'string' },
    answerByAudio: { type: 'boolean', enum: [true, false] },
  },
  required: ['enabled', 'url', 'token', 'waNumber', 'answerByAudio'],
  ...isNotEmpty('enabled', 'url', 'token', 'waNumber', 'answerByAudio'),
};
