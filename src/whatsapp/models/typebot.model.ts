import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

class Session {
  remoteJid?: string;
  sessionId?: string;
  createdAt?: number;
  updateAt?: number;
}

export class TypebotRaw {
  _id?: string;
  enabled?: boolean;
  url: string;
  typebot?: string;
  expire?: number;
  sessions?: Session[];
}

const typebotSchema = new Schema<TypebotRaw>({
  _id: { type: String, _id: true },
  enabled: { type: Boolean, required: true },
  url: { type: String, required: true },
  typebot: { type: String, required: true },
  expire: { type: Number, required: true },
  sessions: [
    {
      remoteJid: { type: String, required: true },
      sessionId: { type: String, required: true },
      createdAt: { type: Number, required: true },
      updateAt: { type: Number, required: true },
    },
  ],
});

export const TypebotModel = dbserver?.model(TypebotRaw.name, typebotSchema, 'typebot');
export type ITypebotModel = typeof TypebotModel;
