import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

export class LabelRaw {
  _id?: string;
  id?: string;
  owner: string;
  name: string;
  color: number;
  predefinedId?: string;
}

type LabelRawBoolean<T> = {
  [P in keyof T]?: 0 | 1;
};
export type LabelRawSelect = LabelRawBoolean<LabelRaw>;

const labelSchema = new Schema<LabelRaw>({
  _id: { type: String, _id: true },
  id: { type: String, required: true, minlength: 1 },
  owner: { type: String, required: true, minlength: 1 },
  name: { type: String, required: true, minlength: 1 },
  color: { type: Number, required: true, min: 0, max: 19 },
  predefinedId: { type: String },
});

export const LabelModel = dbserver?.model(LabelRaw.name, labelSchema, 'labels');
export type ILabelModel = typeof LabelModel;
