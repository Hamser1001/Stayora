import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { models } from '../db/models.js';
import { asyncHandler, fail } from '../middleware/error.js';
import { optionalAuth, publicMember, signToken } from '../middleware/auth.js';

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

    res.json({
      data: {
        token,
        user: publicMember(member),
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
    const member = await models.Staff.findOne({ id: req.user.sub }).lean();
    if (!member) return res.json({ data: null });
    return res.json({ data: { user: publicMember(member), issuedAt: new Date().toISOString() } });
  }),
);

export default router;
