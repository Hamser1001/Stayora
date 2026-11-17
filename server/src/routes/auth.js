import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { models } from '../db/models.js';
import { asyncHandler, fail } from '../middleware/error.js';
import {
  invalidateMember,
  optionalAuth,
  publicMember,
  requireAuth,
  requireAuthLoose,
  signToken,
} from '../middleware/auth.js';
import { hashPassword, validateNewPassword } from '../lib/passwords.js';
import { logActivity } from '../services/activity.js';
import { removeAvatarImage, saveAvatarImage } from '../services/avatars.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s().-]{6,24}$/;

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

/** The current password is always verified before a new one is stored. */
const changePasswordHandler = asyncHandler(async (req, res) => {
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
});

/** Required on first sign-in with a generated temporary password. */
router.post('/change-password', requireAuthLoose, changePasswordHandler);

/** Self-service password change from My Profile. */
router.patch('/profile/password', requireAuthLoose, changePasswordHandler);

/** Every staff member can edit their own name, email address and phone number. */
router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const member = await models.Staff.findOne({ id: req.user.id });
    if (!member) fail('Your account could not be found.', 'UNAUTHENTICATED', 401);

    const name = payload.name === undefined ? member.name : String(payload.name).trim();
    const email =
      payload.email === undefined ? member.email : String(payload.email).trim().toLowerCase();
    const phone =
      payload.phone === undefined ? member.phone || '' : String(payload.phone).trim();

    if (name.length < 2) fail('Enter your full name.', 'VALIDATION_ERROR');
    if (name.length > 80) fail('Keep your name under 80 characters.', 'VALIDATION_ERROR');
    if (!EMAIL_RE.test(email)) fail('Enter a valid email address.', 'VALIDATION_ERROR');
    if (phone && !PHONE_RE.test(phone)) fail('Enter a valid phone number.', 'VALIDATION_ERROR');

    const unchanged =
      name === member.name && email === member.email && phone === (member.phone || '');
    if (unchanged) return res.json({ data: { user: publicMember(member.toObject()) } });

    if (email !== member.email) {
      const existing = await models.Staff.findOne({ email, id: { $ne: member.id } })
        .select({ id: 1 })
        .lean();
      if (existing) fail('That email already belongs to a team member.', 'DUPLICATE_MEMBER');
    }

    const previousEmail = member.email;
    member.name = name;
    member.email = email;
    member.phone = phone;
    try {
      await member.save();
    } catch (error) {
      // The unique email index is the final guard against two simultaneous claims.
      if (error?.code === 11000) {
        fail('That email already belongs to a team member.', 'DUPLICATE_MEMBER');
      }
      throw error;
    }
    invalidateMember(member.id);

    await logActivity({
      actor: member,
      action: 'auth.profile_updated',
      entity: 'staff',
      entityId: member.id,
      meta: {
        email,
        previousEmail,
        nameChanged: name !== req.user.name,
        phoneChanged: phone !== (req.user.phone || ''),
        emailChanged: email !== previousEmail,
      },
    });

    return res.json({ data: { user: publicMember(member.toObject()) } });
  }),
);

/** Per-user preferences (interface language) that follow the account. */
router.patch(
  '/preferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { language } = req.body || {};
    if (language !== undefined && !['en', 'fr'].includes(language)) {
      fail('Choose a supported language.', 'VALIDATION_ERROR');
    }

    const member = await models.Staff.findOne({ id: req.user.id });
    if (!member) fail('Your account could not be found.', 'UNAUTHENTICATED', 401);
    if (language !== undefined) member.language = language;
    await member.save();
    invalidateMember(member.id);

    res.json({ data: { user: publicMember(member.toObject()) } });
  }),
);

/** Every staff member can manage their own profile photo. */
router.post(
  '/profile/avatar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const member = await models.Staff.findOne({ id: req.user.id });
    if (!member) fail('Your account could not be found.', 'UNAUTHENTICATED', 401);

    const avatarUrl = await saveAvatarImage(member.id, req.body?.image);
    const previous = member.avatarUrl;
    member.avatarUrl = avatarUrl;
    await member.save();
    invalidateMember(member.id);
    if (previous && previous !== avatarUrl) await removeAvatarImage(previous);

    await logActivity({
      actor: member,
      action: 'auth.avatar_updated',
      entity: 'staff',
      entityId: member.id,
      meta: { email: member.email },
    });

    res.json({ data: { user: publicMember(member.toObject()) } });
  }),
);

router.delete(
  '/profile/avatar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const member = await models.Staff.findOne({ id: req.user.id });
    if (!member) fail('Your account could not be found.', 'UNAUTHENTICATED', 401);

    const previous = member.avatarUrl;
    member.avatarUrl = '';
    await member.save();
    invalidateMember(member.id);
    await removeAvatarImage(previous);

    await logActivity({
      actor: member,
      action: 'auth.avatar_removed',
      entity: 'staff',
      entityId: member.id,
      meta: { email: member.email },
    });

    res.json({ data: { user: publicMember(member.toObject()) } });
  }),
);

export default router;
