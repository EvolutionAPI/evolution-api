import { Schema } from 'mongoose';

import { dbserver } from '../../libs/db.connect';

class Proxy {
  host?: string;
  port?: string;
  protocol?: string;
  username?: string;
  password?: string;
}

export class ProxyRaw {
  _id?: string;
  enabled?: boolean;
  proxy?: Proxy;
}

const proxySchema = new Schema<ProxyRaw>({
  _id: { type: String, _id: true },
  enabled: { type: Boolean, required: true },
  proxy: {
    host: { type: String, required: true },
    port: { type: String, required: true },
    protocol: { type: String, required: true },
    username: { type: String, required: false },
    password: { type: String, required: false },
  },
});

export const ProxyModel = dbserver?.model(ProxyRaw.name, proxySchema, 'proxy');
export type IProxyModel = typeof ProxyModel;
