import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

export class ChatRaw {
  _id?: string;
  id?: string;
  owner: string;
  lastMsgTimestamp?: number;
}

const chatSchema = new Schema<ChatRaw>({
  _id: { type: String, _id: true },
  id: { type: String, required: true, minlength: 1 },
  owner: { type: String, required: true, minlength: 1 },
});

export const ChatModel = dbserver?.model(ChatRaw.name, chatSchema, 'chats');
export type IChatModel = typeof ChatModel;
