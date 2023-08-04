export class Session {
  remoteJid?: string;
  sessionId?: string;
  createdAt?: number;
  updateAt?: number;
}

export class TypebotDto {
  enabled?: boolean;
  url: string;
  typebot?: string;
  expire?: number;
  sessions?: Session[];
}
