import { Constructor } from '@api/integrations/integration.dto';

export class WebsocketDto {
  enabled: boolean;
  events?: string[];
}

export function WebsocketInstanceMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    websocketEnabled?: boolean;
    websocketEvents?: string[];
  };
}
