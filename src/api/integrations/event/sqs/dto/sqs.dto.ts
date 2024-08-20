import { Constructor } from '@api/dto/integration.dto';

export class SqsDto {
  enabled: boolean;
  events?: string[];
}

export function SQSInstanceMixin<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    sqsEnabled?: boolean;
    sqsEvents?: string[];
  };
}
