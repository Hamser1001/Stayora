import { ApiError } from '../../middleware/error.js';
import { BOOKING_PROVIDERS, providerDefinition } from './registry.js';
import { decryptedCredentials, getIntegration } from './store.js';

/**
 * Booking channel adapter (Booking.com)
 * -------------------------------------
 * This module is the only place that knows how a booking channel maps onto
 * Stayora. It is deliberately isolated from the reservation engine: nothing
 * here writes reservations, changes availability or touches payments.
 *
 * Booking.com only exchanges data with approved partners, so no endpoint URL,
 * payload shape or signature scheme is invented here. The operations below are
 * wired, typed and ready, and they refuse to run until partner access and real
 * credentials exist. `connectionState()` therefore reports `verified: false` and
 * the workspace shows "Pending approval" instead of claiming a live channel.
 */

export const BOOKING_COM_CAPABILITIES = [
  'reservations.pull',
  'reservations.push',
  'reservations.modify',
  'reservations.cancel',
  'availability.push',
  'rates.push',
  'propertyMapping',
  'webhooks',
];

const NOT_CONNECTED = () =>
  new ApiError(
    'This booking channel is not connected. Booking.com requires approved partner access before Stayora can synchronize with it.',
    { code: 'CHANNEL_NOT_CONNECTED', status: 409 },
  );

const NOT_IMPLEMENTED = (operation) =>
  new ApiError(
    `Booking.com ${operation} cannot run yet: partner API access for this property has not been granted.`,
    { code: 'PARTNER_ACCESS_REQUIRED', status: 501 },
  );

/** Pure mapper: external event -> neutral draft. No database writes. */
export function mapReservationEvent(event) {
  if (!event || typeof event !== 'object') {
    throw new ApiError('A booking event payload is required.', {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }
  return {
    externalId: String(event.reservationId || ''),
    externalPropertyId: String(event.propertyId || ''),
    externalRoomId: String(event.roomId || ''),
    externalStatus: String(event.status || ''),
    arrival: event.arrival || null,
    departure: event.departure || null,
    guest: {
      name: String(event.guestName || '').trim(),
      email: String(event.guestEmail || '').trim(),
      phone: String(event.guestPhone || '').trim(),
    },
  };
}

/** Room/bed mapping: stays a plain lookup so reservations stay untouched. */
export function mapRoom(definition, mapping, rooms = []) {
  if (!mapping?.externalRoomId || !mapping?.roomId) return null;
  const room = rooms.find((entry) => entry.id === mapping.roomId);
  if (!room) return null;
  return {
    provider: definition.key,
    externalPropertyId: mapping.externalPropertyId || '',
    externalRoomId: mapping.externalRoomId,
    roomId: room.id,
    roomNumber: room.number,
  };
}

export const bookingComAdapter = {
  provider: 'booking_com',
  capabilities: BOOKING_COM_CAPABILITIES,

  /** Never claims a verified channel: credentials alone do not prove access. */
  async connectionState() {
    const definition = providerDefinition('booking_com');
    const integration = await getIntegration(definition);
    return {
      status: integration.status,
      verified: false,
      hasCredentials: integration.hasCredentials,
      reason: integration.hasCredentials
        ? 'Credentials stored. Booking.com must authorize this property before data can flow.'
        : 'No credentials stored for this property.',
    };
  },

  /** Confirms credentials can be decrypted server-side; never returns them. */
  async assertCredentialsAvailable() {
    const definition = providerDefinition('booking_com');
    const values = await decryptedCredentials(definition);
    if (!values.apiToken) throw NOT_CONNECTED();
    return true;
  },

  async syncReservations() {
    await this.assertCredentialsAvailable();
    throw NOT_IMPLEMENTED('reservation synchronization');
  },

  async pushAvailability() {
    await this.assertCredentialsAvailable();
    throw NOT_IMPLEMENTED('availability synchronization');
  },

  async pushRates() {
    await this.assertCredentialsAvailable();
    throw NOT_IMPLEMENTED('rate synchronization');
  },
};

/** Channel adapters by provider key; other channels share the same contract. */
export const channelAdapters = {
  booking_com: bookingComAdapter,
  airbnb: { ...bookingComAdapter, provider: 'airbnb' },
  expedia: { ...bookingComAdapter, provider: 'expedia' },
};

export function channelAdapterFor(provider) {
  return BOOKING_PROVIDERS.includes(provider) ? channelAdapters[provider] || null : null;
}
