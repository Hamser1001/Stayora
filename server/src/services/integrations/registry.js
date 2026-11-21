/**
 * Integration catalog
 * -------------------
 * The single source of truth for which providers exist, what Stayora can
 * actually do with each one, and which credential fields they accept.
 *
 * Only metadata lives here. No provider endpoint, secret or token is defined in
 * this file, and nothing here may be edited to claim a connection that has not
 * been verified by the provider.
 *
 * availability:
 *   self_service      — the workspace can store its own credentials now.
 *   approval_required — the provider only exchanges data with approved
 *                       partners, so Stayora cannot open a channel from here.
 *   not_available     — no authorization mechanism exists in Stayora yet.
 */

export const INTEGRATION_STATUSES = [
  'not_connected',
  'pending_approval',
  'connected',
  'error',
  'disabled',
];

const bookingChannel = {
  category: 'booking',
  statusWhenConfigured: 'pending_approval',
  connectionTest: 'unavailable',
  capabilities: ['reservations', 'reservationChanges', 'cancellations', 'availability', 'rates', 'propertyMapping'],
  webhooks: {
    supported: false,
    reason:
      'Booking-channel events arrive through partner-specific delivery that requires approved partner access; no inbound endpoint is enabled until that access exists.',
  },
};

export const PROVIDERS = {
  booking_com: {
    ...bookingChannel,
    key: 'booking_com',
    name: 'Booking.com',
    availability: 'self_service',
    summary: 'Two-way reservation, availability and rate synchronization for approved Booking.com partners.',
    credentialFields: [
      { key: 'apiToken', label: 'Partner API token', type: 'password', secret: true, required: true, hint: 'Issued by Booking.com to your property.' },
    ],
    configFields: [
      { key: 'propertyId', label: 'Booking.com property ID', type: 'text', required: false },
    ],
    notes:
      'The adapter is prepared for reservations, modifications, cancellations, availability, rates and room mapping. Nothing is sent to Booking.com until partner access is granted for your property, so a stored token shows as pending approval rather than connected.',
  },
  airbnb: {
    ...bookingChannel,
    key: 'airbnb',
    name: 'Airbnb',
    availability: 'approval_required',
    summary: 'Reservation and calendar synchronization for Airbnb partner accounts.',
    credentialFields: [],
    configFields: [],
    notes:
      'Airbnb only grants API access to selected software partners. Stayora cannot accept credentials or open a channel for this property yet.',
  },
  expedia: {
    ...bookingChannel,
    key: 'expedia',
    name: 'Expedia',
    availability: 'approval_required',
    summary: 'Reservation, availability and rate synchronization for Expedia partners.',
    credentialFields: [],
    configFields: [],
    notes:
      'Expedia connects through its partner programme. No credentials can be accepted until Stayora is enrolled for this property.',
  },
  api_management: {
    key: 'api_management',
    name: 'API Management',
    category: 'developer',
    availability: 'not_available',
    summary: 'Issue and rotate server-side API credentials for your own automation.',
    credentialFields: [],
    configFields: [],
    capabilities: ['apiKeys'],
    webhooks: { supported: false, reason: 'API credential issuing is not enabled for this workspace.' },
    statusWhenConfigured: 'not_connected',
    connectionTest: 'unavailable',
    notes:
      'Stayora signs API requests with staff sessions today. Machine credentials are not issued yet, so there is nothing to configure here.',
  },
  webhooks: {
    key: 'webhooks',
    name: 'Webhook Management',
    category: 'developer',
    availability: 'self_service',
    summary: 'Signed inbound event endpoint with replay protection and idempotent delivery.',
    credentialFields: [
      {
        key: 'signingSecret',
        label: 'Signing secret',
        type: 'password',
        secret: true,
        required: true,
        hint: 'At least 24 characters. Used to verify the SHA-256 signature on every event.',
      },
    ],
    configFields: [
      {
        key: 'callbackUrl',
        label: 'Delivery URL (optional)',
        type: 'url',
        required: false,
        hint: 'https:// address that should receive Stayora events.',
      },
    ],
    capabilities: ['inboundEvents', 'outboundEvents'],
    webhooks: { supported: true, scheme: 'hmac-sha256' },
    statusWhenConfigured: 'connected',
    connectionTest: 'local',
    notes:
      'Events must arrive at POST /api/integrations/webhooks/webhooks with an X-Stayora-Signature header and a timestamp less than five minutes old. Replays are rejected.',
  },
};

export const PROVIDER_ORDER = ['booking_com', 'airbnb', 'expedia', 'api_management', 'webhooks'];

export const BOOKING_PROVIDERS = PROVIDER_ORDER.filter((key) => PROVIDERS[key].category === 'booking');
export const DEVELOPER_PROVIDERS = PROVIDER_ORDER.filter((key) => PROVIDERS[key].category === 'developer');

export function providerDefinition(key) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, key) ? PROVIDERS[key] : null;
}

/** Public (non-secret) description of one provider; never includes values. */
export function publicProvider(definition) {
  return {
    key: definition.key,
    name: definition.name,
    category: definition.category,
    availability: definition.availability,
    summary: definition.summary,
    notes: definition.notes || '',
    capabilities: definition.capabilities || [],
    statusWhenConfigured: definition.statusWhenConfigured,
    connectionTest: definition.connectionTest,
    credentialFields: (definition.credentialFields || []).map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: Boolean(field.required),
      hint: field.hint || '',
    })),
    configFields: (definition.configFields || []).map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: Boolean(field.required),
      hint: field.hint || '',
    })),
    webhooks: {
      supported: Boolean(definition.webhooks?.supported),
      scheme: definition.webhooks?.scheme || null,
      reason: definition.webhooks?.reason || '',
    },
  };
}
