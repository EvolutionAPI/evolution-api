import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';
import { wa } from '../types/wa.types';

class Key {
  id?: string;
  remoteJid?: string;
  fromMe?: boolean;
  participant?: string;
}

class ChatwootMessage {
  messageId?: number;
  inboxId?: number;
  conversationId?: number;
  contactInbox?: { sourceId: string };
  isRead?: boolean;
}

export class MessageRaw {
  _id?: string;
  key?: Key;
  pushName?: string;
  participant?: string;
  message?: object;
  messageType?: string;
  messageTimestamp?: number | Long.Long;
  owner: string;
  source?: 'android' | 'web' | 'ios' | 'unknown' | 'desktop';
  source_id?: string;
  source_reply_id?: string;
  chatwoot?: ChatwootMessage;
  contextInfo?: any;
  status?: wa.StatusMessage | any;
}

type MessageRawBoolean<T> = {
  [P in keyof T]?: 0 | 1;
};
export type MessageRawSelect = Omit<Omit<MessageRawBoolean<MessageRaw>, 'key'>, 'chatwoot'> & {
  key?: MessageRawBoolean<Key>;
  chatwoot?: MessageRawBoolean<ChatwootMessage>;
};

const messageSchema = new Schema<MessageRaw>({
  _id: { type: String, _id: true },
  key: {
    id: { type: String, required: true, minlength: 1 },
    remoteJid: { type: String, required: true, minlength: 1 },
    fromMe: { type: Boolean, required: true },
    participant: { type: String, minlength: 1 },
  },
  pushName: { type: String },
  participant: { type: String },
  messageType: { type: String },
  message: { type: Object },
  source: { type: String, minlength: 3, enum: ['android', 'web', 'ios', 'unknown', 'desktop'] },
  messageTimestamp: { type: Number, required: true },
  owner: { type: String, required: true, minlength: 1 },
  chatwoot: {
    messageId: { type: Number },
    inboxId: { type: Number },
    conversationId: { type: Number },
    contactInbox: { type: Object },
    isRead: { type: Boolean },
  },
});

messageSchema.index({ 'chatwoot.messageId': 1, owner: 1 });
messageSchema.index({ 'key.id': 1 });
messageSchema.index({ 'key.id': 1, owner: 1 });
messageSchema.index({ owner: 1 });

export const MessageModel = dbserver?.model(MessageRaw.name, messageSchema, 'messages');
export type IMessageModel = typeof MessageModel;

export class MessageUpdateRaw {
  _id?: string;
  remoteJid?: string;
  id?: string;
  fromMe?: boolean;
  participant?: string;
  datetime?: number;
  status?: wa.StatusMessage;
  owner: string;
  pollUpdates?: any;
}

const messageUpdateSchema = new Schema<MessageUpdateRaw>({
  _id: { type: String, _id: true },
  remoteJid: { type: String, required: true, min: 1 },
  id: { type: String, required: true, min: 1 },
  fromMe: { type: Boolean, required: true },
  participant: { type: String, min: 1 },
  datetime: { type: Number, required: true, min: 1 },
  status: { type: String, required: true },
  owner: { type: String, required: true, min: 1 },
});

export const MessageUpModel = dbserver?.model(MessageUpdateRaw.name, messageUpdateSchema, 'messageUpdate');
export type IMessageUpModel = typeof MessageUpModel;
