export class InstanceDto {
  instanceName: string;
  qrcode?: boolean;
  number?: string;
  token?: string;
  webhook?: string;
  webhook_by_events?: boolean;
  events?: string[];
  reject_call?: boolean;
  msg_call?: string;
  groups_ignore?: boolean;
  always_online?: boolean;
  read_messages?: boolean;
  read_status?: boolean;
  chatwoot_account_id?: string;
  chatwoot_token?: string;
  chatwoot_url?: string;
  chatwoot_sign_msg?: boolean;
}
