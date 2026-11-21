/** Application modules that can be granted or revoked per staff member. */
export const MODULES = [
  'dashboard',
  'rooms',
  'reservations',
  'guests',
  'payments',
  'expenses',
  'housekeeping',
  'staff',
  'reports',
  'settings',
  'data',
  'integrations',
  'cms',
];

export const ROLE_PERMISSIONS = {
  owner: MODULES,
  manager: MODULES.filter((module) => module !== 'settings'),
  receptionist: ['dashboard', 'rooms', 'reservations', 'guests', 'housekeeping'],
  accountant: ['dashboard', 'payments', 'expenses', 'reports', 'data'],
  housekeeping: ['dashboard', 'rooms', 'housekeeping'],
};

export const STAFF_ROLES = Object.keys(ROLE_PERMISSIONS);

export function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((module) => MODULES.includes(module)))];
}

/** Explicit per-member permissions win; otherwise the role preset applies. */
export function permissionsFor(member) {
  if (!member) return [];
  if (member.role === 'owner') return [...MODULES];
  const explicit = sanitizePermissions(member.permissions);
  if (explicit.length > 0) return explicit;
  return [...(ROLE_PERMISSIONS[member.role] || [])];
}

export function can(member, module) {
  if (!module) return Boolean(member);
  return permissionsFor(member).includes(module);
}

export function requireRoleLevel(member) {
  return member?.role === 'owner' ? 2 : member?.role === 'manager' ? 1 : 0;
}
