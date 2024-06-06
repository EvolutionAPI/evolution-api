import { Schema } from 'mongoose';

import { mongodbServer } from '../../libs/mongodb.connect';

export class IntegrationRaw {
  _id?: string;
  integration?: string;
  number?: string;
  token?: string;
}

const integrationSchema = new Schema<IntegrationRaw>({
  _id: { type: String, _id: true },
  integration: { type: String, required: true },
  number: { type: String, required: true },
  token: { type: String, required: true },
});

export const IntegrationModel = mongodbServer?.model(IntegrationRaw.name, integrationSchema, 'integration');
export type IntegrationModel = typeof IntegrationModel;
