import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { fail } from '../middleware/error.js';

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

/** Cryptographically random, human-copyable temporary password. */
export function generateTemporaryPassword() {
  const pick = (alphabet) => alphabet[randomInt(0, alphabet.length)];
  const body = Array.from({ length: 6 }, () => pick(LOWER + UPPER + DIGITS)).join('');
  return `${pick(UPPER)}${body}${pick(DIGITS)}${pick(LOWER)}`;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function validateNewPassword(password, { currentPassword } = {}) {
  const value = String(password || '');
  if (value.length < 8) {
    fail('Use at least 8 characters for the new password.', 'WEAK_PASSWORD', 400);
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    fail('Include at least one letter and one number.', 'WEAK_PASSWORD', 400);
  }
  if (currentPassword && value === String(currentPassword)) {
    fail('Choose a password different from the temporary one.', 'WEAK_PASSWORD', 400);
  }
  return value;
}
