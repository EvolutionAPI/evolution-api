import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

export class OpenaiRaw {
  _id?: string;
  chave?: string;
  prompts?: string;
  enabled?: boolean;
  events?: string[];
}

const openaiSchema = new Schema<OpenaiRaw>({
  _id: { type: String, _id: true },
  chave: { type: String, required: true },
  prompts: { type: String, required: false },
  enabled: { type: Boolean, required: true },
  events: { type: [String], required: true },
});

export const OpenaiModel = dbserver?.model(OpenaiRaw.name, openaiSchema, 'openai');
export type IOpenaiModel = typeof OpenaiModel;
