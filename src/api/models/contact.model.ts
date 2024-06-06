import { Schema } from 'mongoose';

import { mongodbServer } from '../../libs/mongodb.connect';

export class ContactRaw {
  _id?: string;
  pushName?: string;
  id?: string;
  profilePictureUrl?: string;
  owner: string;
}

type ContactRawBoolean<T> = {
  [P in keyof T]?: 0 | 1;
};
export type ContactRawSelect = ContactRawBoolean<ContactRaw>;

const contactSchema = new Schema<ContactRaw>({
  _id: { type: String, _id: true },
  pushName: { type: String, minlength: 1 },
  id: { type: String, required: true, minlength: 1 },
  profilePictureUrl: { type: String, minlength: 1 },
  owner: { type: String, required: true, minlength: 1 },
});

export const ContactModel = mongodbServer?.model(ContactRaw.name, contactSchema, 'contacts');
export type IContactModel = typeof ContactModel;
