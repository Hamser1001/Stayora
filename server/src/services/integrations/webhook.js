import { ApiError } from '../../middleware/error.js';
import { models } from '../../db/models.js';
import { logActivity } from '../activity.js';
import { hmacSha256, safeEqual } from './crypto.js';
import { providerDefinition } from './registry.js';
import { decryptedCredentials, scrubMessage, WORKSPACE_KEY } from './store.js';

/**
 * Inbound webhook receiver
 * ------------------------
 * Stayora's documented contract for machine events:
 *
 *   POST /api/integrations/inbound/:provider
 *   X-Stayora-Timestamp: <unix seconds>
 *   X-Stayora-Signature: hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))
 *   X-Stayora-Event-Id:  <unique id, up to 128 chars>
 *
 * Verification happens before anything is recorded: a valid signature, a
 * timestamp inside the replay window, and a first-seen event id. Failures are
 * audited without the payload, the signature or the secret.
 */

export const REPLAY_WINDOW_SECONDS = 300;

const header = (headers, name) => {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value || '';
};

async function auditFailure(provider, reason) {
  await logActivity({
    actor: null,
    action: 'integration.webhook_rejected',
    entity: 'integration',
    entityId: `int_${provider}`,
    meta: { provider, reason },
  });
}

export async function receiveWebhook({ provider, headers, rawBody, now = Date.now() }) {
  const definition = providerDefinition(provider);
  if (!definition) {
    throw new ApiError('Unknown integration.', { code: 'NOT_FOUND', status: 404 });
  }
  if (!definition.webhooks?.supported) {
    throw new ApiError(
      definition.webhooks?.reason || 'Inbound events are not enabled for this provider.',
      { code: 'WEBHOOKS_NOT_SUPPORTED', status: 501 },
    );
  }

  const timestamp = header(headers, 'x-stayora-timestamp');
  const signature = header(headers, 'x-stayora-signature');
  const eventId = header(headers, 'x-stayora-event-id');

  if (!timestamp || !signature || !eventId) {
    await auditFailure(provider, 'missing_signature_headers');
    throw new ApiError('Signed webhook headers are required.', {
      code: 'WEBHOOK_SIGNATURE_MISSING',
      status: 401,
    });
  }

  const sentAt = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(sentAt) || Math.abs(Math.floor(now / 1000) - sentAt) > REPLAY_WINDOW_SECONDS) {
    await auditFailure(provider, 'stale_timestamp');
    throw new ApiError('The webhook timestamp is outside the accepted window.', {
      code: 'WEBHOOK_REPLAY_DETECTED',
      status: 401,
    });
  }

  let credentials;
  try {
    credentials = await decryptedCredentials(definition);
  } catch {
    await auditFailure(provider, 'credentials_unreadable');
    throw new ApiError('Webhook verification is unavailable for this integration.', {
      code: 'WEBHOOK_SECRET_UNAVAILABLE',
      status: 409,
    });
  }
  const secret = credentials[definition.credentialFields?.[0]?.key || 'signingSecret'];
  if (!secret) {
    await auditFailure(provider, 'no_signing_secret');
    throw new ApiError('This integration has no signing secret configured.', {
      code: 'WEBHOOK_SECRET_MISSING',
      status: 409,
    });
  }

  const expected = hmacSha256(secret, `${timestamp}.${String(rawBody || '')}`);
  if (!safeEqual(expected, String(signature).toLowerCase())) {
    await auditFailure(provider, 'invalid_signature');
    throw new ApiError('The webhook signature is invalid.', {
      code: 'WEBHOOK_SIGNATURE_INVALID',
      status: 401,
    });
  }

  const dedupeKey = String(eventId).slice(0, 128);
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(dedupeKey)) {
    await auditFailure(provider, 'invalid_event_id');
    throw new ApiError('The event id is not valid.', { code: 'WEBHOOK_EVENT_ID_INVALID', status: 400 });
  }

  let eventType = '';
  try {
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    eventType = scrubMessage(parsed?.type || '', 64);
  } catch {
    eventType = '';
  }

  try {
    await models.WebhookEvent.create({
      id: `whk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      workspaceKey: WORKSPACE_KEY,
      provider,
      dedupeKey,
      eventType,
      receivedAt: new Date(now).toISOString(),
    });
  } catch (error) {
    // Unique index on (workspace, provider, dedupeKey) makes replays no-ops.
    if (error?.code === 11000) {
      return { duplicate: true, provider, eventId: dedupeKey };
    }
    throw error;
  }

  await logActivity({
    actor: null,
    action: 'integration.webhook_received',
    entity: 'integration',
    entityId: `int_${provider}`,
    meta: { provider, eventType },
  });

  return { duplicate: false, provider, eventId: dedupeKey };
}
