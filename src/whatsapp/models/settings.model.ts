import { Schema } from 'mongoose';

import { dbserver } from '../../db/db.connect';

export class SettingsRaw {
  _id?: string;
  reject_call?: boolean;
  msg_call?: string;
  groups_ignore?: boolean;
}

const settingsSchema = new Schema<SettingsRaw>({
  _id: { type: String, _id: true },
  reject_call: { type: Boolean, required: true },
  msg_call: { type: String, required: true },
  groups_ignore: { type: Boolean, required: true },
});

export const SettingsModel = dbserver?.model(
  SettingsRaw.name,
  settingsSchema,
  'settings',
);
export type ISettingsModel = typeof SettingsModel;
