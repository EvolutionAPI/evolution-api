import { Schema } from 'mongoose';

import { mongodbServer } from '../../libs/mongodb.connect';

export class AuthRaw {
  _id?: string;
  apikey?: string;
  instanceId?: string;
}

const authSchema = new Schema<AuthRaw>({
  _id: { type: String, _id: true },
  apikey: { type: String, minlength: 1 },
  instanceId: { type: String, minlength: 1 },
});

export const AuthModel = mongodbServer?.model(AuthRaw.name, authSchema, 'authentication');
export type IAuthModel = typeof AuthModel;
