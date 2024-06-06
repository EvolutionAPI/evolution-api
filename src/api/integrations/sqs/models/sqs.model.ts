import { Schema } from 'mongoose';

import { mongodbServer } from '../../../../libs/mongodb.connect';

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

export const SqsModel = mongodbServer?.model(SqsRaw.name, sqsSchema, 'sqs');
export type ISqsModel = typeof SqsModel;
