# Responsible Messaging And Deliverability

Evolution API is a messaging infrastructure project. Operators are responsible
for following WhatsApp and Meta policies, collecting opt-in consent, respecting
opt-out requests, and avoiding unsolicited or high-volume messaging.

This guide documents guardrails that reduce accidental bursts and make risky
usage easier to identify. They are not anti-ban features, do not bypass platform
enforcement, and do not guarantee message delivery.

## WhatsApp Number Checks

The `/chat/whatsappNumbers/{instance}` endpoint can call WhatsApp Web through
Baileys when a number is not already cached. Large uncached batches create a
burst of platform checks from a single instance.

Evolution API limits and chunks these checks by default:

```env
ABUSE_SAFETY_WHATSAPP_NUMBERS_MAX_BATCH_SIZE=50
ABUSE_SAFETY_WHATSAPP_NUMBERS_QUERY_BATCH_SIZE=10
ABUSE_SAFETY_WHATSAPP_NUMBERS_QUERY_BATCH_INTERVAL_MS=1000
```

When a request exceeds `ABUSE_SAFETY_WHATSAPP_NUMBERS_MAX_BATCH_SIZE`, the API
returns `429 Too Many Requests` with a `Retry-After` header and a structured
response that includes the configured limit.

The chunk interval only adds backpressure between direct Baileys checks. Cached
numbers, groups, broadcasts, and newsletters do not require the same Baileys
lookup path.

## Responsible Operation

- Use WhatsApp Business Platform / Cloud API for production business messaging
  when possible.
- Send messages only to contacts who have explicitly opted in.
- Provide and honor opt-out flows.
- Keep batch sizes bounded and monitor failures, pending delivery, and user
  complaints.
- Treat `delay` as application pacing only. It does not guarantee delivery,
  account safety, or policy compliance.

## Out Of Scope

The guardrails in this project intentionally do not implement proxy rotation,
IP rotation, fingerprint randomization, automated warmup, human-like behavior
simulation, or guarantees that an account will not be restricted.

## References

- Community report about `/chat/whatsappNumbers` bulk check risk:
  https://github.com/evolution-foundation/evolution-api/issues/2228
- Community discussion about constant bans and high-volume sending:
  https://github.com/evolution-foundation/evolution-api/issues/1870
- High-volume queue/rate-limit question closed as usage support:
  https://github.com/evolution-foundation/evolution-api/issues/2538
- Deliverability reports with pending/one-tick messages:
  https://github.com/evolution-foundation/evolution-api/issues/1854
  https://github.com/evolution-foundation/evolution-api/issues/2404
- WhatsApp Business Messaging Policy:
  https://whatsappbusiness.com/policy/
- WhatsApp Business Terms:
  https://www.whatsapp.com/legal/business-terms
