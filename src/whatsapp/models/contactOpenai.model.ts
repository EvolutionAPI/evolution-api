import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

export class ContactOpenaiRaw {
  _id?: string;
  contact?: string;
  enabled?: boolean;
  owner: string;
}

const contactOpenaiSchema = new Schema<ContactOpenaiRaw>({
  _id: { type: String, _id: true },
  contact: { type: String, required: true, minlength: 1 },
  enabled: { type: Boolean, required: true },
  owner: { type: String, required: true, minlength: 1 },
});

export const ContactOpenaiModel = dbserver?.model(ContactOpenaiRaw.name, contactOpenaiSchema, 'openai_contacts');
export type IContactOpenaiModel = typeof ContactOpenaiModel;
