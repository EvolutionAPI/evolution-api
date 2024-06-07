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

export const chatwootSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    enabled: { type: 'boolean', enum: [true, false] },
    accountId: { type: 'string' },
    token: { type: 'string' },
    url: { type: 'string' },
    signMsg: { type: 'boolean', enum: [true, false] },
    signDelimiter: { type: ['string', 'null'] },
    nameInbox: { type: ['string', 'null'] },
    reopenConversation: { type: 'boolean', enum: [true, false] },
    conversation_pending: { type: 'boolean', enum: [true, false] },
    autoCreate: { type: 'boolean', enum: [true, false] },
    importContacts: { type: 'boolean', enum: [true, false] },
    mergeBrazilContacts: { type: 'boolean', enum: [true, false] },
    importMessages: { type: 'boolean', enum: [true, false] },
    daysLimitImportMessages: { type: 'number' },
  },
  required: ['enabled', 'accountId', 'token', 'url', 'signMsg', 'reopenConversation', 'conversation_pending'],
  ...isNotEmpty('enabled', 'accountId', 'token', 'url', 'signMsg', 'reopenConversation', 'conversation_pending'),
};
