import { Schema } from 'mongoose';
import { dbserver } from '../../db/db.connect';

export class ChatwootRaw {
  _id?: string;
  account_id?: string;
  token?: string;
  url?: string;
  name_inbox?: string;
}

const chatwootSchema = new Schema<ChatwootRaw>({
  _id: { type: String, _id: true },
  account_id: { type: String, required: true },
  token: { type: String, required: true },
  url: { type: String, required: true },
  name_inbox: { type: String, required: true },
});

export const ChatwootModel = dbserver?.model(
  ChatwootRaw.name,
  chatwootSchema,
  'chatwoot',
);
export type IChatwootModel = typeof ChatwootModel;
