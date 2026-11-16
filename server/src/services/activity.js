import { models } from '../db/models.js';

/**
 * Append-only audit trail for actions that matter to the workspace owner:
 * staff and access changes, data imports/exports and sign-in events.
 */
export async function logActivity({ actor, action, entity = 'staff', entityId = null, meta = {} }) {
  try {
    await models.Activity.create({
      id: `act_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      actorId: actor?.id || null,
      actorName: actor?.name || 'System',
      action,
      entity,
      entityId,
      meta,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    // Activity logging must never break the request it describes.
    console.error('Could not record activity:', error.message);
  }
}

export async function recentActivity({ actorId, entityId, limit = 60 } = {}) {
  const filter = actorId && entityId
    ? { $or: [{ actorId }, { entityId }] }
    : actorId
      ? { actorId }
      : entityId
        ? { entityId }
        : {};
  return models.Activity.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(1, limit)))
    .lean();
}
