import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { models } from '../db/models.js';
import { ApiError } from './error.js';
import { memo, invalidate } from '../services/cache.js';
import { can, permissionsFor } from '../lib/permissions.js';

/** Paths a member may call while their temporary password still has to change. */
const PASSWORD_CHANGE_PATHS = ['/auth/me', '/auth/change-password', '/auth/logout'];

export function signToken(member) {
  return jwt.sign(
    { sub: member.id, name: member.name, email: member.email, role: member.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

export function publicMember(member) {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    status: member.status,
    permissions: permissionsFor(member),
    avatarUrl: member.avatarUrl || '',
    language: member.language || 'en',
    mustChangePassword: Boolean(member.mustChangePassword),
    lastActive: member.lastActive || null,
    invitedAt: member.invitedAt || null,
    passwordUpdatedAt: member.passwordUpdatedAt || null,
    initials: String(member.name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join(''),
  };
}

/** Staff lookups are cached briefly; writes invalidate the entry immediately. */
export function memberById(id) {
  return memo(`staff:member:${id}`, 10000, () => models.Staff.findOne({ id }).lean());
}

export function invalidateMember(id) {
  invalidate(id ? `staff:member:${id}` : 'staff:member:');
}

function unauthenticated() {
  return new ApiError('Your session has expired. Please sign in again.', {
    code: 'UNAUTHENTICATED',
    status: 401,
  });
}

/** Resolves the bearer token to a live staff record (suspension is enforced here). */
export async function resolveMember(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw unauthenticated();

  let payload;
  try {
    payload = jwt.verify(header.slice(7), env.jwtSecret);
  } catch {
    throw unauthenticated();
  }

  const member = await memberById(payload.sub);
  if (!member) throw unauthenticated();
  if (member.status === 'suspended') {
    throw new ApiError('This account is suspended. Contact the workspace owner.', {
      code: 'ACCOUNT_SUSPENDED',
      status: 403,
    });
  }
  return member;
}

export const requireAuth = async (req, res, next) => {
  try {
    const member = await resolveMember(req);

    if (member.mustChangePassword) {
      return next(
        new ApiError('Set a new password before continuing.', {
          code: 'PASSWORD_CHANGE_REQUIRED',
          status: 403,
        }),
      );
    }

    req.user = member;
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Like requireAuth, but usable before the temporary password is replaced. */
export const requireAuthLoose = async (req, res, next) => {
  try {
    req.user = await resolveMember(req);
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Authenticated member with access to a module (backend is the source of truth). */
export function requirePermission(module) {
  return async (req, res, next) => {
    try {
      const member = await resolveMember(req);
      if (member.mustChangePassword) {
        return next(
          new ApiError('Set a new password before continuing.', {
            code: 'PASSWORD_CHANGE_REQUIRED',
            status: 403,
          }),
        );
      }
      if (!can(member, module)) {
        return next(
          new ApiError('You do not have access to this area of the workspace.', {
            code: 'FORBIDDEN',
            status: 403,
          }),
        );
      }
      req.user = member;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/** Owner/manager gate for access-control endpoints. */
export function requireStaffManager(req, res, next) {
  if (!req.user) {
    return next(unauthenticated());
  }
  if (!['owner', 'manager'].includes(req.user.role)) {
    return next(
      new ApiError('Only owners and managers can manage the team.', {
        code: 'FORBIDDEN',
        status: 403,
      }),
    );
  }
  return next();
}

/** Attaches `req.user` when a valid bearer token is present; never throws. */
export async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    req.user = await resolveMember(req);
  } catch {
    req.user = null;
  }
  return next();
}

export { PASSWORD_CHANGE_PATHS };
