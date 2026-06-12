export type WhatsappNumbersGuardrailsConfig = {
  MAX_BATCH_SIZE?: number;
  QUERY_BATCH_SIZE?: number;
  QUERY_BATCH_INTERVAL_MS?: number;
};

export type WhatsappNumbersGuardrails = {
  maxBatchSize: number;
  queryBatchSize: number;
  queryBatchIntervalMs: number;
};

export type WhatsappNumbersValidationResult =
  | {
      ok: true;
      numbers: string[];
    }
  | {
      ok: false;
      type: 'bad_request';
      message: string;
    }
  | {
      ok: false;
      type: 'too_many_requests';
      message: string;
      received: number;
      maxBatchSize: number;
      retryAfter: number;
      docs: string;
      reference: string;
    };

export type WhatsappNumbersObservation = {
  action: 'whatsappNumbers.check';
  requestedNumbers: number;
  userJids: number;
  groupJids: number;
  broadcastJids: number;
  newsletterJids: number;
  cacheHits: number;
  cacheMisses: number;
  baileysQueries: number;
  cacheWrites: number;
  maxBatchSize: number;
  queryBatchSize: number;
  queryBatchIntervalMs: number;
  durationMs: number;
  rejected: boolean;
  rejectionReason?: string;
};

export type WhatsappNumbersObservationInput = Omit<
  WhatsappNumbersObservation,
  'action' | 'maxBatchSize' | 'queryBatchSize' | 'queryBatchIntervalMs' | 'rejected'
> & {
  guardrails: WhatsappNumbersGuardrails;
  rejected?: boolean;
};

export const resolveWhatsappNumbersGuardrails = (
  config?: WhatsappNumbersGuardrailsConfig,
): WhatsappNumbersGuardrails => ({
  maxBatchSize: Math.max(1, config?.MAX_BATCH_SIZE ?? 50),
  queryBatchSize: Math.max(1, config?.QUERY_BATCH_SIZE ?? 10),
  queryBatchIntervalMs: Math.max(0, config?.QUERY_BATCH_INTERVAL_MS ?? 1000),
});

export const validateWhatsappNumbersBatch = (
  numbers: unknown,
  guardrails: WhatsappNumbersGuardrails,
): WhatsappNumbersValidationResult => {
  if (!Array.isArray(numbers)) {
    return {
      ok: false,
      type: 'bad_request',
      message: 'numbers must be an array of WhatsApp identifiers.',
    };
  }

  if (numbers.length === 0) {
    return {
      ok: false,
      type: 'bad_request',
      message: 'At least one WhatsApp number must be provided.',
    };
  }

  if (numbers.length > guardrails.maxBatchSize) {
    const retryAfter = Math.max(1, Math.ceil(guardrails.queryBatchIntervalMs / 1000));

    return {
      ok: false,
      type: 'too_many_requests',
      message: `whatsappNumbers accepts up to ${guardrails.maxBatchSize} numbers per request.`,
      received: numbers.length,
      maxBatchSize: guardrails.maxBatchSize,
      retryAfter,
      docs: 'docs/responsible-messaging.md',
      reference: 'https://github.com/evolution-foundation/evolution-api/issues/2228',
    };
  }

  return { ok: true, numbers };
};

export const buildWhatsappNumbersObservation = ({
  guardrails,
  rejected = false,
  ...observation
}: WhatsappNumbersObservationInput): WhatsappNumbersObservation => ({
  action: 'whatsappNumbers.check',
  rejected,
  maxBatchSize: guardrails.maxBatchSize,
  queryBatchSize: guardrails.queryBatchSize,
  queryBatchIntervalMs: guardrails.queryBatchIntervalMs,
  ...observation,
});
