import { Schema } from 'mongoose';

import { dbserver } from '../../../../libs/db.connect';

export class ChamaaiRaw {
  _id?: string;
  enabled?: boolean;
  url?: string;
  token?: string;
  waNumber?: string;
  answerByAudio?: boolean;
}

const chamaaiSchema = new Schema<ChamaaiRaw>({
  _id: { type: String, _id: true },
  enabled: { type: Boolean, required: true },
  url: { type: String, required: true },
  token: { type: String, required: true },
  waNumber: { type: String, required: true },
  answerByAudio: { type: Boolean, required: true },
});

export const ChamaaiModel = dbserver?.model(ChamaaiRaw.name, chamaaiSchema, 'chamaai');
export type IChamaaiModel = typeof ChamaaiModel;
