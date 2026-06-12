import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildWhatsappNumbersObservation,
  resolveWhatsappNumbersGuardrails,
  validateWhatsappNumbersBatch,
} from '../src/utils/whatsappNumbersGuardrails';

describe('whatsappNumbers guardrails', () => {
  it('uses conservative defaults when no environment override exists', () => {
    assert.deepEqual(resolveWhatsappNumbersGuardrails(), {
      maxBatchSize: 50,
      queryBatchSize: 10,
      queryBatchIntervalMs: 1000,
    });
  });

  it('normalizes invalid guardrail values to safe minimums', () => {
    assert.deepEqual(
      resolveWhatsappNumbersGuardrails({
        MAX_BATCH_SIZE: 0,
        QUERY_BATCH_SIZE: -10,
        QUERY_BATCH_INTERVAL_MS: -1,
      }),
      {
        maxBatchSize: 1,
        queryBatchSize: 1,
        queryBatchIntervalMs: 0,
      },
    );
  });

  it('rejects missing, non-array, and empty numbers payloads', () => {
    const guardrails = resolveWhatsappNumbersGuardrails();

    assert.deepEqual(validateWhatsappNumbersBatch(undefined, guardrails), {
      ok: false,
      type: 'bad_request',
      message: 'numbers must be an array of WhatsApp identifiers.',
    });

    assert.deepEqual(validateWhatsappNumbersBatch('5511999999999', guardrails), {
      ok: false,
      type: 'bad_request',
      message: 'numbers must be an array of WhatsApp identifiers.',
    });

    assert.deepEqual(validateWhatsappNumbersBatch([], guardrails), {
      ok: false,
      type: 'bad_request',
      message: 'At least one WhatsApp number must be provided.',
    });
  });

  it('rejects oversized batches with retry metadata and docs reference', () => {
    const guardrails = resolveWhatsappNumbersGuardrails({
      MAX_BATCH_SIZE: 2,
      QUERY_BATCH_INTERVAL_MS: 1500,
    });

    assert.deepEqual(validateWhatsappNumbersBatch(['1', '2', '3'], guardrails), {
      ok: false,
      type: 'too_many_requests',
      message: 'whatsappNumbers accepts up to 2 numbers per request.',
      received: 3,
      maxBatchSize: 2,
      retryAfter: 2,
      docs: 'docs/responsible-messaging.md',
      reference: 'https://github.com/evolution-foundation/evolution-api/issues/2228',
    });
  });

  it('builds aggregate observations without including raw phone numbers', () => {
    const observation = buildWhatsappNumbersObservation({
      requestedNumbers: 12,
      userJids: 10,
      groupJids: 1,
      broadcastJids: 1,
      newsletterJids: 0,
      cacheHits: 7,
      cacheMisses: 3,
      baileysQueries: 3,
      cacheWrites: 2,
      guardrails: resolveWhatsappNumbersGuardrails({ MAX_BATCH_SIZE: 50, QUERY_BATCH_SIZE: 5 }),
      durationMs: 25,
    });

    assert.deepEqual(observation, {
      action: 'whatsappNumbers.check',
      requestedNumbers: 12,
      userJids: 10,
      groupJids: 1,
      broadcastJids: 1,
      newsletterJids: 0,
      cacheHits: 7,
      cacheMisses: 3,
      baileysQueries: 3,
      cacheWrites: 2,
      maxBatchSize: 50,
      queryBatchSize: 5,
      queryBatchIntervalMs: 1000,
      durationMs: 25,
      rejected: false,
    });

    assert.equal(JSON.stringify(observation).includes('5511999999999'), false);
  });
});
