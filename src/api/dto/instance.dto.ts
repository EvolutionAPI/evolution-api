import { WAPresence } from 'baileys';

import { IntegrationDto } from './integration.dto';

export class InstanceDto extends IntegrationDto {
  instanceName: string;
  instanceId?: string;
  qrcode?: boolean;
  businessId?: string;
  number?: string;
  integration?: string;
  token?: string;
  // settings
  rejectCall?: boolean;
  msgCall?: string;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
  // proxy
  proxyHost?: string;
  proxyPort?: string;
  proxyProtocol?: string;
  proxyUsername?: string;
  proxyPassword?: string;
}

export class SetPresenceDto {
  presence: WAPresence;
}
