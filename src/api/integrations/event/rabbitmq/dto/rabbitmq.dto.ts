import { Constructor } from '@api/dto/integration.dto';

export class RabbitmqDto {
  enabled: boolean;
  events?: string[];
}

export function RabbitMQInstanceMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    rabbitmqEnabled?: boolean;
    rabbitmqEvents?: string[];
  };
}
