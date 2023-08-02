import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

export class WebsocketRaw {
  _id?: string;
  enabled?: boolean;
  events?: string[];
}

const websocketSchema = new Schema<WebsocketRaw>({
  _id: { type: String, _id: true },
  enabled: { type: Boolean, required: true },
  events: { type: [String], required: true },
});

export const WebsocketModel = dbserver?.model(WebsocketRaw.name, websocketSchema, 'websocket');
export type IWebsocketModel = typeof WebsocketModel;
