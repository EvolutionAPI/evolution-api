import { proto, WAPresence } from 'baileys';

export class Quoted {
  key: proto.IMessageKey;
  message: proto.IMessage;
}

export class Options {
  delay?: number;
  presence?: WAPresence;
  quoted?: Quoted;
  linkPreview?: boolean;
  encoding?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  webhookUrl?: string;
}

export class MediaMessage {
  mediatype: MediaType;
  mimetype?: string;
  caption?: string;
  // for document
  fileName?: string;
  // url or base64
  media: string;
}

export class StatusMessage {
  type: string;
  content: string;
  statusJidList?: string[];
  allContacts?: boolean;
  caption?: string;
  backgroundColor?: string;
  font?: number;
}

export class Metadata {
  number: string;
  delay?: number;
  quoted?: Quoted;
  linkPreview?: boolean;
  mentionsEveryOne?: boolean;
  mentioned?: string[];
  encoding?: boolean;
}

export class SendTextDto extends Metadata {
  text: string;
}
export class SendPresence extends Metadata {
  text: string;
}

export class SendStatusDto extends Metadata {
  type: string;
  content: string;
  statusJidList?: string[];
  allContacts?: boolean;
  caption?: string;
  backgroundColor?: string;
  font?: number;
}

export class SendPollDto extends Metadata {
  name: string;
  selectableCount: number;
  values: string[];
  messageSecret?: Uint8Array;
}

export type MediaType = 'image' | 'document' | 'video' | 'audio';

export class SendMediaDto extends Metadata {
  mediatype: MediaType;
  mimetype?: string;
  caption?: string;
  // for document
  fileName?: string;
  // url or base64
  media: string;
}

export class SendStickerDto extends Metadata {
  sticker: string;
}

export class SendAudioDto extends Metadata {
  audio: string;
}

class Button {
  text: string;
  id: string;
}
export class SendButtonDto extends Metadata {
  title: string;
  description: string;
  footerText?: string;
  buttons: Button[];
}

export class SendLocationDto extends Metadata {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

class Row {
  title: string;
  description: string;
  rowId: string;
}
class Section {
  title: string;
  rows: Row[];
}
export class SendListDto extends Metadata {
  title: string;
  description?: string;
  footerText?: string;
  buttonText: string;
  sections: Section[];
}

export class ContactMessage {
  fullName: string;
  wuid: string;
  phoneNumber: string;
  organization?: string;
  email?: string;
  url?: string;
}

export class SendTemplateDto extends Metadata {
  name: string;
  language: string;
  components: any;
  webhookUrl?: string;
}
export class SendContactDto extends Metadata {
  contact: ContactMessage[];
}

export class SendReactionDto {
  key: proto.IMessageKey;
  reaction: string;
}
