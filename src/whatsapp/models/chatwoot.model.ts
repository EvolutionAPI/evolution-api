import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

export class ChatwootRaw {
  _id?: string;
  enabled?: boolean;
  account_id?: string;
  token?: string;
  url?: string;
  name_inbox?: string;
  sign_msg?: boolean;
  number?: string;
  reopen_conversation?: boolean;
  conversation_pending?: boolean;
}

const chatwootSchema = new Schema<ChatwootRaw>({
  _id: { type: String, _id: true },
  enabled: { type: Boolean, required: true },
  account_id: { type: String, required: true },
  token: { type: String, required: true },
  url: { type: String, required: true },
  name_inbox: { type: String, required: true },
  sign_msg: { type: Boolean, required: true },
  number: { type: String, required: true },
});

export const ChatwootModel = dbserver?.model(ChatwootRaw.name, chatwootSchema, 'chatwoot');
export type IChatwootModel = typeof ChatwootModel;
