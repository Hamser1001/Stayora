import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from './error.js';

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
    initials: member.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join(''),
  };
}

/** Attaches `req.user` when a valid bearer token is present; never throws. */
export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    req.user = jwt.verify(header.slice(7), env.jwtSecret);
  } catch {
    req.user = null;
  }
  return next();
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return next(new ApiError('Your session has expired. Please sign in again.', {
      code: 'UNAUTHENTICATED',
      status: 401,
    }));
  }
  try {
    req.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch {
    return next(new ApiError('Your session has expired. Please sign in again.', {
      code: 'UNAUTHENTICATED',
      status: 401,
    }));
  }
}
