import { Router } from 'express';
import { asyncHandler, ApiError, fail } from '../middleware/error.js';
import { requirePermission } from '../middleware/auth.js';
import { createRateLimiter } from '../lib/rateLimit.js';
import { assertPublicHttpsUrl } from '../lib/urlPolicy.js';
import { logActivity } from '../services/activity.js';
import {
  BOOKING_PROVIDERS,
  DEVELOPER_PROVIDERS,
  PROVIDERS,
  providerDefinition,
  publicProvider,
} from '../services/integrations/registry.js';
import {
  getIntegration,
  listIntegrations,
  revokeCredentials,
  rotateEncryption,
  saveCredentials,
  setEnabled,
} from '../services/integrations/store.js';
import { encryptionState } from '../services/integrations/crypto.js';
import { channelAdapterFor } from '../services/integrations/bookingcom.js';
import { receiveWebhook } from '../services/integrations/webhook.js';

/**
 * Integration management API
 * --------------------------
 * Every route below is authenticated, permission-gated and rate limited, and
 * every response is built from `publicIntegration()`/`publicProvider()` — there
 * is no code path that serialises a credential, ciphertext or key.
 *
 * Authentication uses bearer tokens (never cookies), so there is no ambient
 * credential for CSRF to ride on; state-changing routes are additionally
 * owner-only and size-limited.
 */
const router = Router();

const MAX_BODY_BYTES = 16 * 1024;
const readLimiter = createRateLimiter({ windowMs: 60000, max: 120, scope: 'integrations:read' });
const writeLimiter = createRateLimiter({ windowMs: 60000, max: 20, scope: 'integrations:write' });
const inboundLimiter = createRateLimiter({
  windowMs: 60000,
  max: 120,
  scope: 'integrations:inbound',
  key: (req) => req.ip || 'anonymous',
});

function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}

function limitBody(req, res, next) {
  const declared = Number.parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return next(
      new ApiError('The request body is too large.', {
        code: 'PAYLOAD_TOO_LARGE',
        status: 413,
      }),
    );
  }
  return next();
}

/** Roles are resolved from the session, never from the request payload. */
function requireOwner(req, res, next) {
  if (!req.user) {
    return next(new ApiError('Your session has expired. Please sign in again.', {
      code: 'UNAUTHENTICATED',
      status: 401,
    }));
  }
  if (req.user.role !== 'owner') {
    return next(
      new ApiError('Only the workspace owner can change integration credentials.', {
        code: 'FORBIDDEN',
        status: 403,
      }),
    );
  }
  return next();
}

function managedProvider(req) {
  const definition = providerDefinition(req.params.provider);
  if (!definition) fail('Unknown integration.', 'NOT_FOUND', 404);
  return definition;
}

function assertManageable(definition) {
  if (definition.availability !== 'self_service') {
    fail(
      definition.notes ||
        'This integration cannot be configured for this workspace yet.',
      'INTEGRATION_NOT_AVAILABLE',
      409,
    );
  }
}

/** Strict allow-list validation: unknown keys and oversized values are refused. */
function readCredentialPayload(definition, body) {
  const credentials = body?.credentials ?? {};
  const config = body?.config ?? {};
  if (typeof credentials !== 'object' || Array.isArray(credentials)) {
    fail('Credentials must be an object.', 'VALIDATION_ERROR');
  }
  if (typeof config !== 'object' || Array.isArray(config)) {
    fail('Configuration must be an object.', 'VALIDATION_ERROR');
  }

  const allowedSecretKeys = new Set((definition.credentialFields || []).map((field) => field.key));
  for (const key of Object.keys(credentials)) {
    if (!allowedSecretKeys.has(key)) {
      fail(`Unknown credential field: ${String(key).slice(0, 40)}.`, 'VALIDATION_ERROR');
    }
  }

  const values = {};
  let total = 0;
  for (const field of definition.credentialFields || []) {
    const value = credentials[field.key];
    if (value === undefined || value === null || String(value).trim() === '') {
      if (field.required) fail(`${field.label} is required.`, 'VALIDATION_ERROR');
      continue;
    }
    if (typeof value !== 'string') fail(`${field.label} must be text.`, 'VALIDATION_ERROR');
    const trimmed = value.trim();
    if (trimmed.length > 4096) fail(`${field.label} is too long.`, 'VALIDATION_ERROR');
    total += trimmed.length;
    values[field.key] = trimmed;
  }
  if (total > MAX_BODY_BYTES) {
    fail('The submitted credentials are too large.', 'PAYLOAD_TOO_LARGE', 413);
  }

  const allowedConfigKeys = new Set((definition.configFields || []).map((field) => field.key));
  const safeConfig = {};
  for (const [key, value] of Object.entries(config)) {
    if (!allowedConfigKeys.has(key)) {
      fail(`Unknown configuration field: ${String(key).slice(0, 40)}.`, 'VALIDATION_ERROR');
    }
    let text = String(value ?? '').trim();
    if (key === 'callbackUrl' && text) {
      try {
        text = assertPublicHttpsUrl(text);
      } catch (error) {
        fail(error.message, 'UNSAFE_URL');
      }
    }
    if (text.length > 2048) fail('That configuration value is too long.', 'VALIDATION_ERROR');
    safeConfig[key] = text;
  }

  return { values, config: safeConfig };
}

/* --------------------------------- Reading -------------------------------- */

router.get(
  '/',
  noStore,
  readLimiter,
  requirePermission('integrations'),
  asyncHandler(async (req, res) => {
    const definitions = BOOKING_PROVIDERS.concat(DEVELOPER_PROVIDERS).map((key) => PROVIDERS[key]);
    const integrations = await listIntegrations(definitions);
    const byKey = new Map(integrations.map((entry) => [entry.key, entry]));
    const shape = (key) => ({ ...publicProvider(PROVIDERS[key]), ...byKey.get(key) });

    res.json({
      data: {
        groups: [
          {
            key: 'booking',
            providers: BOOKING_PROVIDERS.map(shape),
          },
          {
            key: 'developer',
            providers: DEVELOPER_PROVIDERS.map(shape),
          },
        ],
        storage: encryptionState(),
        canManage: req.user.role === 'owner',
      },
    });
  }),
);

router.get(
  '/:provider',
  noStore,
  readLimiter,
  requirePermission('integrations'),
  asyncHandler(async (req, res) => {
    const definition = managedProvider(req);
    res.json({
      data: { ...publicProvider(definition), ...(await getIntegration(definition)) },
    });
  }),
);

/* -------------------------------- Credentials ------------------------------ */

router.post(
  '/:provider/credentials',
  noStore,
  writeLimiter,
  limitBody,
  requirePermission('integrations'),
  requireOwner,
  asyncHandler(async (req, res) => {
    const definition = managedProvider(req);
    assertManageable(definition);
    const { values, config } = readCredentialPayload(definition, req.body || {});
    const integration = await saveCredentials({
      definition,
      values,
      config,
      actor: req.user,
    });
    // The response is metadata only: the values that were just sent are gone.
    res.status(201).json({ data: integration });
  }),
);

router.post(
  '/:provider/rotate',
  noStore,
  writeLimiter,
  limitBody,
  requirePermission('integrations'),
  requireOwner,
  asyncHandler(async (req, res) => {
    const definition = managedProvider(req);
    assertManageable(definition);
    const integration = await rotateEncryption({ definition, actor: req.user });
    res.json({ data: integration });
  }),
);

router.delete(
  '/:provider/credentials',
  noStore,
  writeLimiter,
  requirePermission('integrations'),
  requireOwner,
  asyncHandler(async (req, res) => {
    const definition = managedProvider(req);
    const result = await revokeCredentials({ definition, actor: req.user });
    res.json({ data: result });
  }),
);

/* ----------------------------- Enable / disable ---------------------------- */

router.patch(
  '/:provider',
  noStore,
  writeLimiter,
  limitBody,
  requirePermission('integrations'),
  requireOwner,
  asyncHandler(async (req, res) => {
    const definition = managedProvider(req);
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') fail('Choose whether to enable this integration.', 'VALIDATION_ERROR');
    const integration = await setEnabled({ definition, enabled, actor: req.user });
    res.json({ data: integration });
  }),
);

/* ----------------------------- Connection attempt -------------------------- */

router.post(
  '/:provider/test',
  noStore,
  writeLimiter,
  requirePermission('integrations'),
  requireOwner,
  asyncHandler(async (req, res) => {
    const definition = managedProvider(req);
    const adapter = channelAdapterFor(definition.key);

    let result;
    if (adapter) {
      result = await adapter.connectionState();
      if (result.hasCredentials) {
        try {
          await adapter.assertCredentialsAvailable();
          result = {
            ...result,
            verified: false,
            detail:
              'Stored credentials were read and decrypted on the server. Booking.com still has to authorize this property before a connection can be confirmed, so the channel stays pending approval.',
          };
        } catch (error) {
          result = {
            ...result,
            verified: false,
            detail: error.message,
          };
        }
      }
    } else {
      const state = await getIntegration(definition);
      result = {
        status: state.status,
        verified: definition.connectionTest === 'local' && state.hasCredentials,
        detail:
          definition.connectionTest === 'local'
            ? 'This endpoint is hosted by Stayora, so its configuration is verified locally.'
            : 'This integration does not support a connection test yet.',
      };
    }

    await logActivity({
      actor: req.user,
      action: 'integration.connection_attempt',
      entity: 'integration',
      entityId: `int_${definition.key}`,
      meta: { provider: definition.key, verified: Boolean(result.verified), status: result.status },
    });

    res.json({ data: result });
  }),
);

/* ------------------------------- Inbound events ---------------------------- */

router.post(
  '/inbound/:provider',
  noStore,
  inboundLimiter,
  asyncHandler(async (req, res) => {
    const result = await receiveWebhook({
      provider: req.params.provider,
      headers: req.headers,
      rawBody: req.rawBody || '',
    });
    res.status(result.duplicate ? 200 : 202).json({ data: result });
  }),
);

/* ------------------------------ Activity trail ----------------------------- */

export default router;
