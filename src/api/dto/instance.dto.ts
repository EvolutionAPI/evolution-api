import { WAPresence } from '@whiskeysockets/baileys';

export class InstanceDto {
  instanceName: string;
  instanceId?: string;
  qrcode?: boolean;
  number?: string;
  integration?: string;
  token?: string;
  webhookUrl?: string;
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  webhookEvents?: string[];
  rejectCall?: boolean;
  msgCall?: string;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
  chatwootAccountId?: string;
  chatwootToken?: string;
  chatwootUrl?: string;
  chatwootSignMsg?: boolean;
  chatwootReopenConversation?: boolean;
  chatwootConversationPending?: boolean;
  chatwootMergeBrazilContacts?: boolean;
  chatwootImportContacts?: boolean;
  chatwootImportMessages?: boolean;
  chatwootDaysLimitImportMessages?: number;
  chatwootNameInbox?: string;
  websocketEnabled?: boolean;
  websocketEvents?: string[];
  rabbitmqEnabled?: boolean;
  rabbitmqEvents?: string[];
  sqsEnabled?: boolean;
  sqsEvents?: string[];
  typebotUrl?: string;
  typebot?: string;
  typebotExpire?: number;
  typebotKeywordFinish?: string;
  typebotDelayMessage?: number;
  typebotUnknownMessage?: string;
  typebotListeningFromMe?: boolean;
  proxyHost?: string;
  proxyPort?: string;
  proxyProtocol?: string;
  proxyUsername?: string;
  proxyPassword?: string;
}

export class SetPresenceDto {
  presence: WAPresence;
}
