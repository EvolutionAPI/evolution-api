import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

export class AuthRaw {
  _id?: string;
  jwt?: string;
  apikey?: string;
  instanceId?: string;
}

const authSchema = new Schema<AuthRaw>({
  _id: { type: String, _id: true },
  jwt: { type: String, minlength: 1 },
  apikey: { type: String, minlength: 1 },
  instanceId: { type: String, minlength: 1 },
});

export const AuthModel = dbserver?.model(AuthRaw.name, authSchema, 'authentication');
export type IAuthModel = typeof AuthModel;
