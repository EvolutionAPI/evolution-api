export class WebhookDto {
  enabled?: boolean;
  url?: string;
  events?: string[];
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
}
