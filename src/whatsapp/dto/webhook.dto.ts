export class WebhookDto {
  enabled?: boolean;
  url?: string;
  events?: string[];
  webhook_by_events?: boolean;
}
