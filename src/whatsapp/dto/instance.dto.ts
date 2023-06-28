export class InstanceDto {
  instanceName: string;
  webhook?: string;
  webhook_by_events?: boolean;
  events?: string[];
  qrcode?: boolean;
  token?: string;
}
