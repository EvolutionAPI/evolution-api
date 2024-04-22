import { Schema } from 'mongoose';

import { dbserver } from '../../../../libs/db.connect';

export class SqsRaw {
  _id?: string;
  enabled?: boolean;
  events?: string[];
}

const sqsSchema = new Schema<SqsRaw>({
  _id: { type: String, _id: true },
  enabled: { type: Boolean, required: true },
  events: { type: [String], required: true },
});

export const SqsModel = dbserver?.model(SqsRaw.name, sqsSchema, 'sqs');
export type ISqsModel = typeof SqsModel;
