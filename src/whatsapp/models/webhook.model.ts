import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

export class WebhookRaw {
  _id?: string;
  url?: string;
  enabled?: boolean;
  events?: string[];
  webhook_by_events?: boolean;
}

const webhookSchema = new Schema<WebhookRaw>({
  _id: { type: String, _id: true },
  url: { type: String, required: true },
  enabled: { type: Boolean, required: true },
  events: { type: [String], required: true },
  webhook_by_events: { type: Boolean, required: true },
});

export const WebhookModel = dbserver?.model(WebhookRaw.name, webhookSchema, 'webhook');
export type IWebhookModel = typeof WebhookModel;
