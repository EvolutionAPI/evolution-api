import { Constructor } from '@api/dto/integration.dto';

export class WebhookDto {
  enabled?: boolean;
  url?: string;
  events?: string[];
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
}

export function WebhookInstanceMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    webhookUrl?: string;
    webhookByEvents?: boolean;
    webhookBase64?: boolean;
    webhookEvents?: string[];
  };
}
