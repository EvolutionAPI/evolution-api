/* eslint-disable @typescript-eslint/no-namespace */

/**
 * Enumeration of various application events.
 */
export enum Events {
  APPLICATION_STARTUP = 'application.startup',
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
}

/**
 * Namespace containing various WhatsApp-related types.
 */
export declare namespace wa {
  /**
   * Represents a QR code for pairing with WhatsApp.
   */
  export type QrCode = {
    count?: number;
    pairingCode?: string;
    base64?: string;
    code?: string;
  };

  /**
   * Represents information about a WhatsApp instance.
   */
  export type Instance = {
    qrcode?: QrCode;
    pairingCode?: string;
    authState?: { state: AuthenticationState; saveCreds: () => void };
    name?: string;
    wuid?: string;
    profileName?: string;
    profilePictureUrl?: string;
  };

  /**
   * Represents local webhook settings.
   */
  export type LocalWebHook = {
    enabled?: boolean;
    url?: string;
    events?: string[];
    webhook_by_events?: boolean;
  };

  /**
   * Represents local Chatwoot settings.
   */
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
  };

  /**
   * Represents local settings.
   */
  export type LocalSettings = {
    reject_call?: boolean;
    msg_call?: string;
    groups_ignore?: boolean;
    always_online?: boolean;
    read_messages?: boolean;
    read_status?: boolean;
  };

  /**
   * Represents local WebSocket settings.
   */
  export type LocalWebsocket = {
    enabled?: boolean;
    events?: string[];
  };

  /**
   * Represents local RabbitMQ settings.
   */
  export type LocalRabbitmq = {
    enabled?: boolean;
    events?: string[];
  };

  /**
   * Represents a session within a Typebot instance.
   */
  type Session = {
    remoteJid?: string;
    sessionId?: string;
    createdAt?: number;
  };

  /**
   * Represents local Typebot settings.
   */
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

  /**
   * Represents local proxy settings.
   */
  export type LocalProxy = {
    enabled?: boolean;
    proxy?: string;
  };

  /**
   * Represents local Chamaai settings.
   */
  export type LocalChamaai = {
    enabled?: boolean;
    url?: string;
    token?: string;
    waNumber?: string;
    answerByAudio?: boolean;
  };

  /**
   * Represents the state of a connection with a WhatsApp instance.
   */
  export type StateConnection = {
    instance?: string;
    state?: WAConnectionState | 'refused';
    statusReason?: number;
  };

  /**
   * Represents a status message type.
   */
  export type StatusMessage = 'ERROR' | 'PENDING' | 'SERVER_ACK' | 'DELIVERY_ACK' | 'READ' | 'DELETED' | 'PLAYED';
}

/**
 * Array of media message types.
 */
export const TypeMediaMessage = ['imageMessage', 'documentMessage', 'audioMessage', 'videoMessage', 'stickerMessage'];

/**
 * Array of message subtype types.
 */
export const MessageSubtype = [
  'ephemeralMessage',
  'documentWithCaptionMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
];
