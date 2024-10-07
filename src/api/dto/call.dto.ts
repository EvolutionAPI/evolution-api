export class Metadata {
  number: string;
}

export class OfferCallDto extends Metadata {
  isVideo?: boolean;
  callDuration?: number;
}
