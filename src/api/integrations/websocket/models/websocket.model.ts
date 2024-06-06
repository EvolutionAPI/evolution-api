import { Schema } from 'mongoose';

import { mongodbServer } from '../../../../libs/mongodb.connect';

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

export const WebsocketModel = mongodbServer?.model(WebsocketRaw.name, websocketSchema, 'websocket');
export type IWebsocketModel = typeof WebsocketModel;
