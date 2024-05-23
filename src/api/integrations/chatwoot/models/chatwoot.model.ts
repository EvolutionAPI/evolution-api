import { Schema } from 'mongoose';

import { dbserver } from '../../../../libs/db.connect';

export class ChatwootRaw {
  _id?: string;
  enabled?: boolean;
  account_id?: string;
  token?: string;
  url?: string;
  name_inbox?: string;
  sign_msg?: boolean;
  sign_delimiter?: string;
  number?: string;
  reopen_conversation?: boolean;
  conversation_pending?: boolean;
  merge_brazil_contacts?: boolean;
  import_contacts?: boolean;
  import_messages?: boolean;
  days_limit_import_messages?: number;
}

const chatwootSchema = new Schema<ChatwootRaw>({
  _id: { type: String, _id: true },
  enabled: { type: Boolean, required: true },
  account_id: { type: String, required: true },
  token: { type: String, required: true },
  url: { type: String, required: true },
  name_inbox: { type: String, required: true },
  sign_msg: { type: Boolean, required: true },
  sign_delimiter: { type: String, required: false },
  number: { type: String, required: true },
  reopen_conversation: { type: Boolean, required: true },
  conversation_pending: { type: Boolean, required: true },
  merge_brazil_contacts: { type: Boolean, required: true },
  import_contacts: { type: Boolean, required: true },
  import_messages: { type: Boolean, required: true },
  days_limit_import_messages: { type: Number, required: true },
});

export const ChatwootModel = dbserver?.model(ChatwootRaw.name, chatwootSchema, 'chatwoot');
export type IChatwootModel = typeof ChatwootModel;
