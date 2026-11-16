import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { models } from '../db/models.js';
import { asyncHandler, fail } from '../middleware/error.js';
import {
  invalidateMember,
  optionalAuth,
  publicMember,
  requireAuthLoose,
  signToken,
} from '../middleware/auth.js';
import { hashPassword, validateNewPassword } from '../lib/passwords.js';
import { logActivity } from '../services/activity.js';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) fail('Enter your email and password.', 'VALIDATION_ERROR');
    if (String(password).length < 8) {
      fail('Password must be at least 8 characters.', 'VALIDATION_ERROR');
    }

    const member = await models.Staff.findOne({ email: String(email).toLowerCase() }).select(
      '+passwordHash',
    );
    if (!member) fail('Email or password is incorrect.', 'INVALID_CREDENTIALS', 401);

    const matches = await bcrypt.compare(String(password), member.passwordHash);
    if (!matches) fail('Email or password is incorrect.', 'INVALID_CREDENTIALS', 401);
    if (member.status === 'suspended') {
      fail('This account is suspended. Contact the workspace owner.', 'ACCOUNT_SUSPENDED', 403);
    }

    const token = signToken(member);
    member.lastActive = new Date().toISOString();
    await member.save();

    await logActivity({
      actor: member,
      action: 'auth.login',
      entity: 'session',
      entityId: member.id,
      meta: { email: member.email },
    });

    res.json({
      data: {
        token,
        user: publicMember(member.toObject()),
        issuedAt: new Date().toISOString(),
      },
    });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    res.json({ data: true });
  }),
);

router.get(
  '/me',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) return res.json({ data: null });
    return res.json({ data: { user: publicMember(req.user), issuedAt: new Date().toISOString() } });
  }),
);

/** Required on first sign-in with a generated temporary password. */
router.post(
  '/change-password',
  requireAuthLoose,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword) fail('Enter your current password.', 'VALIDATION_ERROR');

    const member = await models.Staff.findOne({ id: req.user.id }).select('+passwordHash');
    if (!member) fail('Your account could not be found.', 'UNAUTHENTICATED', 401);

    const matches = await bcrypt.compare(String(currentPassword), member.passwordHash);
    if (!matches) fail('Your current password is incorrect.', 'INVALID_CREDENTIALS', 400);

    const password = validateNewPassword(newPassword, { currentPassword });
    member.passwordHash = await hashPassword(password);
    member.mustChangePassword = false;
    member.passwordUpdatedAt = new Date().toISOString();
    member.tempPasswordIssuedAt = null;
    await member.save();
    invalidateMember(member.id);

    await logActivity({
      actor: member,
      action: 'auth.password_changed',
      entity: 'session',
      entityId: member.id,
      meta: { email: member.email },
    });

    res.json({ data: { user: publicMember(member.toObject()) } });
  }),
);

export default router;
