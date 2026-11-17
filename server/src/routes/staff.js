import { Router } from 'express';
import { models } from '../db/models.js';
import { asyncHandler, fail } from '../middleware/error.js';
import {
  invalidateMember,
  publicMember,
  requireAuth,
  requirePermission,
  requireStaffManager,
} from '../middleware/auth.js';
import { MODULES, permissionsFor, ROLE_PERMISSIONS, sanitizePermissions, STAFF_ROLES } from '../lib/permissions.js';
import { generateTemporaryPassword, hashPassword } from '../lib/passwords.js';
import { logActivity, recentActivity } from '../services/activity.js';
import { removeAvatarImage } from '../services/avatars.js';
import { nextIdFor } from '../services/snapshot.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function shape(member) {
  return {
    ...publicMember(member),
    createdBy: member.createdBy || '',
    tempPasswordIssuedAt: member.tempPasswordIssuedAt || null,
  };
}

function assertManagerCanTouch(actor, target) {
  if (actor.role === 'owner') return;
  // Managers keep control of their own profile; permission guards still apply.
  if (actor.id === target.id) return;
  if (target.role === 'owner') {
    fail('The owner account can only be managed by the owner.', 'FORBIDDEN', 403);
  }
  if (target.role === 'manager') {
    fail('Managers cannot manage other managers.', 'FORBIDDEN', 403);
  }
}

function guardPermissions(actor, requested) {
  const permissions = sanitizePermissions(requested);
  if (actor.role !== 'owner') {
    const granted = permissionsFor(actor);
    const escalated = permissions.find((module) => !granted.includes(module));
    if (escalated) {
      fail(`You cannot grant access to ${escalated} because you do not have it.`, 'FORBIDDEN', 403);
    }
  }
  return permissions;
}

/** Metadata for the staff UI: modules, presets and the caller's own access. */
router.get(
  '/meta',
  requirePermission('staff'),
  asyncHandler(async (req, res) => {
    res.json({
      data: {
        modules: MODULES,
        rolePermissions: ROLE_PERMISSIONS,
        roles: STAFF_ROLES,
        me: { id: req.user.id, role: req.user.role, permissions: permissionsFor(req.user) },
      },
    });
  }),
);

/** Workspace activity feed (owners and managers only). */
router.get(
  '/activity',
  requirePermission('staff'),
  requireStaffManager,
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 60;
    res.json({ data: await recentActivity({ limit }) });
  }),
);

router.use(requirePermission('staff'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const staff = await models.Staff.find().sort({ name: 1 }).lean();
    res.json({
      data: staff.map((member) => ({
        ...shape(member),
        rolePermissions: [...(ROLE_PERMISSIONS[member.role] || [])],
      })),
    });
  }),
);

router.get(
  '/:id/activity',
  asyncHandler(async (req, res) => {
    const isManager = ['owner', 'manager'].includes(req.user.role);
    if (!isManager && req.user.id !== req.params.id) {
      fail('You can only view your own activity.', 'FORBIDDEN', 403);
    }
    const activities = await recentActivity({
      actorId: req.params.id,
      entityId: req.params.id,
      limit: Number(req.query.limit) || 60,
    });
    res.json({ data: activities });
  }),
);

/** Create a staff member and hand back a one-time temporary password. */
router.post(
  '/',
  requireAuth,
  requireStaffManager,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const role = payload.role || 'receptionist';

    if (name.length < 2) fail('Enter the staff member’s full name.', 'VALIDATION_ERROR');
    if (!EMAIL_RE.test(email)) fail('Enter a valid email address.', 'VALIDATION_ERROR');
    if (!STAFF_ROLES.includes(role) || role === 'owner') {
      fail('Choose a valid staff role.', 'VALIDATION_ERROR');
    }
    if (payload.permissions !== undefined && !Array.isArray(payload.permissions)) {
      fail('Permissions must be a list of modules.', 'VALIDATION_ERROR');
    }

    const existing = await models.Staff.findOne({ email }).select({ id: 1 }).lean();
    if (existing) fail('That email already belongs to a team member.', 'DUPLICATE_MEMBER');

    const permissions = guardPermissions(req.user, payload.permissions || []);
    const temporaryPassword = generateTemporaryPassword();
    const now = new Date().toISOString();

    const member = await models.Staff.create({
      id: await nextIdFor('staff', models.Staff),
      name,
      email,
      passwordHash: await hashPassword(temporaryPassword),
      role,
      status: 'active',
      permissions,
      mustChangePassword: true,
      tempPasswordIssuedAt: now,
      passwordUpdatedAt: null,
      lastActive: null,
      invitedAt: now,
      createdBy: req.user.id,
    });

    await logActivity({
      actor: req.user,
      action: 'staff.created',
      entityId: member.id,
      meta: { name, email, role, permissions },
    });

    // The plain password is returned exactly once; only a hash is stored.
    res.status(201).json({
      data: { member: shape(member.toObject()), temporaryPassword },
    });
  }),
);

/** Edit name, email, role and module access. */
router.patch(
  '/:id',
  requireAuth,
  requireStaffManager,
  asyncHandler(async (req, res) => {
    const target = await models.Staff.findOne({ id: req.params.id });
    if (!target) fail('Member not found.', 'NOT_FOUND', 404);
    assertManagerCanTouch(req.user, target);

    const payload = req.body || {};
    const patch = {};
    const changed = {};

    if (payload.name !== undefined) {
      const name = String(payload.name).trim();
      if (name.length < 2) fail('Enter the staff member’s full name.', 'VALIDATION_ERROR');
      patch.name = name;
      changed.name = name;
    }

    if (payload.email !== undefined) {
      const email = String(payload.email).trim().toLowerCase();
      if (!EMAIL_RE.test(email)) fail('Enter a valid email address.', 'VALIDATION_ERROR');
      if (email !== target.email) {
        const duplicate = await models.Staff.findOne({ email }).select({ id: 1 }).lean();
        if (duplicate) fail('That email already belongs to a team member.', 'DUPLICATE_MEMBER');
      }
      patch.email = email;
      changed.email = email;
    }

    if (payload.role !== undefined) {
      const role = payload.role;
      if (!STAFF_ROLES.includes(role)) fail('Choose a valid staff role.', 'VALIDATION_ERROR');
      if (target.role === 'owner' && role !== 'owner') {
        fail('The owner role cannot be changed.', 'OWNER_LOCKED');
      }
      if (role === 'owner' && req.user.role !== 'owner') {
        fail('Only the owner can hand over the owner role.', 'FORBIDDEN', 403);
      }
      patch.role = role;
      changed.role = role;
    }

    if (payload.permissions !== undefined) {
      if (!Array.isArray(payload.permissions)) fail('Permissions must be a list of modules.', 'VALIDATION_ERROR');
      if (target.role === 'owner') fail('The owner always has full access.', 'OWNER_LOCKED');
      patch.permissions = guardPermissions(req.user, payload.permissions);
      changed.permissions = patch.permissions;
    }

    if (Object.keys(patch).length === 0) fail('Nothing to update.', 'VALIDATION_ERROR');

    Object.assign(target, patch);
    if (patch.role === 'owner') target.permissions = [];
    await target.save();
    invalidateMember(target.id);

    await logActivity({ actor: req.user, action: 'staff.updated', entityId: target.id, meta: changed });
    res.json({ data: shape(target.toObject()) });
  }),
);

/** Suspend, reactivate or restore an account. */
router.patch(
  '/:id/status',
  requireAuth,
  requireStaffManager,
  asyncHandler(async (req, res) => {
    const target = await models.Staff.findOne({ id: req.params.id });
    if (!target) fail('Member not found.', 'NOT_FOUND', 404);
    if (target.id === req.user.id) fail('You cannot change your own account status.', 'SELF_LOCKED');
    if (target.role === 'owner') fail('The owner account cannot be suspended.', 'OWNER_LOCKED');
    assertManagerCanTouch(req.user, target);

    const status = req.body?.status;
    if (!['active', 'suspended'].includes(status)) fail('Choose active or suspended.', 'VALIDATION_ERROR');

    target.status = status;
    await target.save();
    invalidateMember(target.id);

    await logActivity({
      actor: req.user,
      action: status === 'suspended' ? 'staff.suspended' : 'staff.reactivated',
      entityId: target.id,
      meta: { name: target.name, email: target.email },
    });
    res.json({ data: shape(target.toObject()) });
  }),
);

/** Issue a fresh temporary password and force a change at next sign-in. */
router.post(
  '/:id/reset-password',
  requireAuth,
  requireStaffManager,
  asyncHandler(async (req, res) => {
    const target = await models.Staff.findOne({ id: req.params.id });
    if (!target) fail('Member not found.', 'NOT_FOUND', 404);
    assertManagerCanTouch(req.user, target);
    if (target.id === req.user.id) fail('Use your profile settings to change your own password.', 'SELF_LOCKED');

    const temporaryPassword = generateTemporaryPassword();
    target.passwordHash = await hashPassword(temporaryPassword);
    target.mustChangePassword = true;
    target.tempPasswordIssuedAt = new Date().toISOString();
    target.passwordUpdatedAt = null;
    await target.save();
    invalidateMember(target.id);

    await logActivity({
      actor: req.user,
      action: 'staff.password_reset',
      entityId: target.id,
      meta: { name: target.name, email: target.email },
    });

    res.json({ data: { member: shape(target.toObject()), temporaryPassword } });
  }),
);

/** Permanently remove a staff account. */
router.delete(
  '/:id',
  requireAuth,
  requireStaffManager,
  asyncHandler(async (req, res) => {
    const target = await models.Staff.findOne({ id: req.params.id }).lean();
    if (!target) fail('Member not found.', 'NOT_FOUND', 404);
    if (target.id === req.user.id) fail('You cannot delete your own account.', 'SELF_LOCKED');
    if (target.role === 'owner') fail('The owner account cannot be removed.', 'OWNER_LOCKED');
    assertManagerCanTouch(req.user, target);

    await models.Staff.deleteOne({ id: target.id });
    invalidateMember(target.id);
    await removeAvatarImage(target.avatarUrl);

    await logActivity({
      actor: req.user,
      action: 'staff.deleted',
      entityId: target.id,
      meta: { name: target.name, email: target.email },
    });
    res.json({ data: { id: target.id } });
  }),
);

export default router;
