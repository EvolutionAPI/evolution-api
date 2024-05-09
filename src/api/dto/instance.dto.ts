import { WAPresence } from 'baileys';

import { ProxyDto } from './proxy.dto';

export class InstanceDto {
  instanceName: string;
  instanceId?: string;
  qrcode?: boolean;
  number?: string;
  mobile?: boolean;
  integration?: string;
  token?: string;
  webhook?: string;
  webhook_by_events?: boolean;
  webhook_base64?: boolean;
  events?: string[];
  reject_call?: boolean;
  msg_call?: string;
  groups_ignore?: boolean;
  always_online?: boolean;
  read_messages?: boolean;
  read_status?: boolean;
  sync_full_history?: boolean;
  chatwoot_account_id?: string;
  chatwoot_token?: string;
  chatwoot_url?: string;
  chatwoot_sign_msg?: boolean;
  chatwoot_reopen_conversation?: boolean;
  chatwoot_conversation_pending?: boolean;
  chatwoot_merge_brazil_contacts?: boolean;
  chatwoot_import_contacts?: boolean;
  chatwoot_import_messages?: boolean;
  chatwoot_days_limit_import_messages?: number;
  chatwoot_name_inbox?: string;
  websocket_enabled?: boolean;
  websocket_events?: string[];
  rabbitmq_enabled?: boolean;
  rabbitmq_events?: string[];
  sqs_enabled?: boolean;
  sqs_events?: string[];
  typebot_url?: string;
  typebot?: string;
  typebot_expire?: number;
  typebot_keyword_finish?: string;
  typebot_delay_message?: number;
  typebot_unknown_message?: string;
  typebot_listening_from_me?: boolean;
  proxy?: ProxyDto['proxy'];
}

export class SetPresenceDto {
  presence: WAPresence;
}
