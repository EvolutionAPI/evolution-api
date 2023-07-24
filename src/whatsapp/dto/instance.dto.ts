export class InstanceDto {
  instanceName: string;
  webhook?: string;
  webhook_by_events?: boolean;
  events?: string[];
  qrcode?: boolean;
  number?: string;
  token?: string;
  chatwoot_account_id?: string;
  chatwoot_token?: string;
  chatwoot_url?: string;
  chatwoot_sign_msg?: boolean;
}
