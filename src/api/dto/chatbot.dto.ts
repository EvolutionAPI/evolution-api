export class Session {
  remoteJid?: string;
  sessionId?: string;
  status?: string;
  createdAt?: number;
  updateAt?: number;
}

export class IgnoreJidDto {
  remoteJid?: string;
  action?: string;
}
