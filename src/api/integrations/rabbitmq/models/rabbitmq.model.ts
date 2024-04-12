import { Schema } from 'mongoose';

import { dbserver } from '../../../../libs/db.connect';

export class RabbitmqRaw {
  _id?: string;
  enabled?: boolean;
  events?: string[];
}

const rabbitmqSchema = new Schema<RabbitmqRaw>({
  _id: { type: String, _id: true },
  enabled: { type: Boolean, required: true },
  events: { type: [String], required: true },
});

export const RabbitmqModel = dbserver?.model(RabbitmqRaw.name, rabbitmqSchema, 'rabbitmq');
export type IRabbitmqModel = typeof RabbitmqModel;
