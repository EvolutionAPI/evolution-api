import { Schema } from 'mongoose';

import { mongodbServer } from '../../../../libs/mongodb.connect';

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

export const RabbitmqModel = mongodbServer?.model(RabbitmqRaw.name, rabbitmqSchema, 'rabbitmq');
export type IRabbitmqModel = typeof RabbitmqModel;
