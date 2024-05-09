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
    account_id: { type: 'string' },
    token: { type: 'string' },
    url: { type: 'string' },
    sign_msg: { type: 'boolean', enum: [true, false] },
    sign_delimiter: { type: ['string', 'null'] },
    name_inbox: { type: ['string', 'null'] },
    reopen_conversation: { type: 'boolean', enum: [true, false] },
    conversation_pending: { type: 'boolean', enum: [true, false] },
    auto_create: { type: 'boolean', enum: [true, false] },
    import_contacts: { type: 'boolean', enum: [true, false] },
    merge_brazil_contacts: { type: 'boolean', enum: [true, false] },
    import_messages: { type: 'boolean', enum: [true, false] },
    days_limit_import_messages: { type: 'number' },
  },
  required: ['enabled', 'account_id', 'token', 'url', 'sign_msg', 'reopen_conversation', 'conversation_pending'],
  ...isNotEmpty('account_id', 'token', 'url', 'sign_msg', 'reopen_conversation', 'conversation_pending'),
};
