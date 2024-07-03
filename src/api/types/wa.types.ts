/* eslint-disable @typescript-eslint/no-namespace */
import { AuthenticationState, WAConnectionState } from 'baileys';

export enum Events {
  APPLICATION_STARTUP = 'application.startup',
  INSTANCE_CREATE = 'instance.create',
  INSTANCE_DELETE = 'instance.delete',
  QRCODE_UPDATED = 'qrcode.updated',
  CONNECTION_UPDATE = 'connection.update',
  STATUS_INSTANCE = 'status.instance',
  MESSAGES_SET = 'messages.set',
  MESSAGES_UPSERT = 'messages.upsert',
  MESSAGES_UPDATE = 'messages.update',
  MESSAGES_DELETE = 'messages.delete',
  SEND_MESSAGE = 'send.message',
  CONTACTS_SET = 'contacts.set',
  CONTACTS_UPSERT = 'contacts.upsert',
  CONTACTS_UPDATE = 'contacts.update',
  PRESENCE_UPDATE = 'presence.update',
  CHATS_SET = 'chats.set',
  CHATS_UPDATE = 'chats.update',
  CHATS_UPSERT = 'chats.upsert',
  CHATS_DELETE = 'chats.delete',
  GROUPS_UPSERT = 'groups.upsert',
  GROUPS_UPDATE = 'groups.update',
  GROUP_PARTICIPANTS_UPDATE = 'group-participants.update',
  CALL = 'call',
  TYPEBOT_START = 'typebot.start',
  TYPEBOT_CHANGE_STATUS = 'typebot.change-status',
  CHAMA_AI_ACTION = 'chama-ai.action',
  LABELS_EDIT = 'labels.edit',
  LABELS_ASSOCIATION = 'labels.association',
  CREDS_UPDATE = 'creds.update',
  MESSAGING_HISTORY_SET = 'messaging-history.set',
}

export declare namespace wa {
  export type QrCode = {
    count?: number;
    pairingCode?: string;
    base64?: string;
    code?: string;
  };
  export type Instance = {
    qrcode?: QrCode;
    pairingCode?: string;
    authState?: { state: AuthenticationState; saveCreds: () => void };
    name?: string;
    wuid?: string;
    profileName?: string;
    profilePictureUrl?: string;
  };

  export type LocalWebHook = {
    enabled?: boolean;
    url?: string;
    events?: string[];
    webhook_by_events?: boolean;
    webhook_base64?: boolean;
  };

  export type LocalChatwoot = {
    enabled?: boolean;
    account_id?: string;
    token?: string;
    url?: string;
    name_inbox?: string;
    sign_msg?: boolean;
    number?: string;
    reopen_conversation?: boolean;
    conversation_pending?: boolean;
    merge_brazil_contacts?: boolean;
    import_contacts?: boolean;
    import_messages?: boolean;
    days_limit_import_messages?: number;
  };

  export type LocalSettings = {
    reject_call?: boolean;
    msg_call?: string;
    groups_ignore?: boolean;
    always_online?: boolean;
    read_messages?: boolean;
    read_status?: boolean;
    sync_full_history?: boolean;
  };

  export type LocalWebsocket = {
    enabled?: boolean;
    events?: string[];
  };

  export type LocalRabbitmq = {
    enabled?: boolean;
    events?: string[];
  };

  export type LocalSqs = {
    enabled?: boolean;
    events?: string[];
  };

  type Session = {
    remoteJid?: string;
    sessionId?: string;
    createdAt?: number;
  };

  export type LocalTypebot = {
    enabled?: boolean;
    url?: string;
    typebot?: string;
    expire?: number;
    keyword_finish?: string;
    delay_message?: number;
    unknown_message?: string;
    listening_from_me?: boolean;
    sessions?: Session[];
  };

  type Proxy = {
    host?: string;
    port?: string;
    protocol?: string;
    username?: string;
    password?: string;
  };

  export type LocalProxy = {
    enabled?: boolean;
    proxy?: Proxy;
  };

  export type LocalChamaai = {
    enabled?: boolean;
    url?: string;
    token?: string;
    waNumber?: string;
    answerByAudio?: boolean;
  };

  export type LocalIntegration = {
    integration?: string;
    number?: string;
    token?: string;
  };

  export type StateConnection = {
    instance?: string;
    state?: WAConnectionState | 'refused';
    statusReason?: number;
  };

  export type StatusMessage = 'ERROR' | 'PENDING' | 'SERVER_ACK' | 'DELIVERY_ACK' | 'READ' | 'DELETED' | 'PLAYED';
}

export const TypeMediaMessage = ['imageMessage', 'documentMessage', 'audioMessage', 'videoMessage', 'stickerMessage'];

export const MessageSubtype = [
  'ephemeralMessage',
  'documentWithCaptionMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
];

export const Integration = {
  WHATSAPP_BUSINESS: 'WHATSAPP-BUSINESS',
  WHATSAPP_BAILEYS: 'WHATSAPP-BAILEYS',
};
