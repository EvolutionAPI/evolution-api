import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

export class ProxyRaw {
  _id?: string;
  enabled?: boolean;
  proxy?: string;
}

const proxySchema = new Schema<ProxyRaw>({
  _id: { type: String, _id: true },
  enabled: { type: Boolean, required: true },
  proxy: { type: String, required: true },
});

export const ProxyModel = dbserver?.model(ProxyRaw.name, proxySchema, 'proxy');
export type IProxyModel = typeof ProxyModel;
