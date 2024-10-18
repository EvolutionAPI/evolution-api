import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

export class SettingsRaw {
  _id?: string;
  reject_call?: boolean;
  msg_call?: string;
  groups_ignore?: boolean;
  always_online?: boolean;
  read_messages?: boolean;
  read_status?: boolean;
  sync_full_history?: boolean;
  ignore_list?: string[];
  initial_connection?: number;
}

const settingsSchema = new Schema<SettingsRaw>({
  _id: { type: String, _id: true },
  reject_call: { type: Boolean, required: true },
  msg_call: { type: String, required: true },
  groups_ignore: { type: Boolean, required: true },
  always_online: { type: Boolean, required: true },
  read_messages: { type: Boolean, required: true },
  read_status: { type: Boolean, required: true },
  sync_full_history: { type: Boolean, required: true },
  ignore_list: { type: [String], required: false },
  initial_connection: { type: Number, required: false },
});

export const SettingsModel = dbserver?.model(SettingsRaw.name, settingsSchema, 'settings');
export type ISettingsModel = typeof SettingsModel;
