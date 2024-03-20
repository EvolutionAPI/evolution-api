import { proto, WAPresence } from '@whiskeysockets/baileys';

export class Quoted {
  key: proto.IMessageKey;
  message: proto.IMessage;
}

export class Mentions {
  everyOne: boolean;
  mentioned: string[];
}

export class Options {
  delay?: number;
  presence?: WAPresence;
  quoted?: Quoted;
  mentions?: Mentions;
  linkPreview?: boolean;
  encoding?: boolean;
}
class OptionsMessage {
  options: Options;
}

export class Metadata extends OptionsMessage {
  number: string;
}

class TextMessage {
  text: string;
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

class PollMessage {
  name: string;
  selectableCount: number;
  values: string[];
  messageSecret?: Uint8Array;
}
export class SendTextDto extends Metadata {
  textMessage: TextMessage;
}

export class SendStatusDto extends Metadata {
  statusMessage: StatusMessage;
}

export class SendPollDto extends Metadata {
  pollMessage: PollMessage;
}

export type MediaType = 'image' | 'document' | 'video' | 'audio';
export class MediaMessage {
  mediatype: MediaType;
  caption?: string;
  // for document
  fileName?: string;
  // url or base64
  media: string;
}
export class SendMediaDto extends Metadata {
  mediaMessage: MediaMessage;
}
class Sticker {
  image: string;
}
export class SendStickerDto extends Metadata {
  stickerMessage: Sticker;
}

class Audio {
  audio: string;
}
export class SendAudioDto extends Metadata {
  audioMessage: Audio;
}

class Button {
  buttonText: string;
  buttonId: string;
}
class ButtonMessage {
  title: string;
  description: string;
  footerText?: string;
  buttons: Button[];
  mediaMessage?: MediaMessage;
}
export class SendButtonDto extends Metadata {
  buttonMessage: ButtonMessage;
}

class LocationMessage {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}
export class SendLocationDto extends Metadata {
  locationMessage: LocationMessage;
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
class ListMessage {
  title: string;
  description: string;
  footerText?: string;
  buttonText: string;
  sections: Section[];
}
export class SendListDto extends Metadata {
  listMessage: ListMessage;
}

export class ContactMessage {
  fullName: string;
  wuid: string;
  phoneNumber: string;
  organization?: string;
  email?: string;
  url?: string;
}
export class SendContactDto extends Metadata {
  contactMessage: ContactMessage[];
}

class ReactionMessage {
  key: proto.IMessageKey;
  reaction: string;
}
export class SendReactionDto {
  reactionMessage: ReactionMessage;
}
