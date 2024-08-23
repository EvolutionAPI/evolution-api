import { Constructor } from '@api/integrations/integration.dto';

export class EventDto {
  webhook?: {
    enabled: boolean;
    events?: string[];
    url?: string;
    byEvents?: boolean;
    base64?: boolean;
  };

  websocket?: {
    enabled: boolean;
    events?: string[];
  };

  sqs?: {
    enabled: boolean;
    events?: string[];
  };

  rabbitmq?: {
    enabled: boolean;
    events?: string[];
  };
}

export function EventInstanceMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    webhook?: {
      enabled: boolean;
      events?: string[];
      url?: string;
      byEvents?: boolean;
      base64?: boolean;
    };

    websocket?: {
      enabled: boolean;
      events?: string[];
    };

    sqs?: {
      enabled: boolean;
      events?: string[];
    };

    rabbitmq?: {
      enabled: boolean;
      events?: string[];
    };
  };
}
