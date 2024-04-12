export class WebhookDto {
  enabled?: boolean;
  url?: string;
  events?: string[];
  webhook_by_events?: boolean;
  webhook_base64?: boolean;
}
