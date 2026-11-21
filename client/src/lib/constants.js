export const ROOM_TYPES = ['dorm', 'private', 'twin', 'family', 'suite'];
export const ROOM_AUDIENCES = ['mixed', 'female', 'male'];
export const BED_STATUSES = ['available', 'occupied', 'reserved', 'cleaning', 'maintenance', 'inactive'];
export const RESERVATION_STATUSES = ['pending', 'confirmed', 'checkedIn', 'checkedOut', 'cancelled', 'noShow'];
export const BOOKING_SOURCES = [
  'direct',
  'walkIn',
  'website',
  'phone',
  'bookingCom',
  'hostelworld',
  'airbnb',
  'agent',
];
export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'online', 'other'];
export const PAYMENT_STATUSES = ['paid', 'partial', 'unpaid'];
export const EXPENSE_CATEGORIES = [
  'electricity',
  'water',
  'internet',
  'cleaning',
  'maintenance',
  'salaries',
  'supplies',
  'marketing',
  'other',
];
export const TASK_TYPES = ['cleaning', 'maintenance', 'inspection', 'linen'];
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const TASK_STATUSES = ['open', 'inProgress', 'completed'];
export const ROLES = ['owner', 'manager', 'receptionist', 'accountant', 'housekeeping'];

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

/** Mirrors the server presets; explicit member permissions always win. */
export const ROLE_MODULES = {
  owner: MODULES,
  manager: MODULES.filter((module) => module !== 'settings'),
  receptionist: ['dashboard', 'rooms', 'reservations', 'guests', 'housekeeping'],
  accountant: ['dashboard', 'payments', 'expenses', 'reports', 'data'],
  housekeeping: ['dashboard', 'rooms', 'housekeeping'],
};

export function permissionsOf(user) {
  if (!user) return [];
  if (user.role === 'owner') return MODULES;
  if (Array.isArray(user.permissions) && user.permissions.length) return user.permissions;
  return ROLE_MODULES[user.role] || [];
}
export const STAFF_STATUSES = ['active', 'invited', 'suspended'];
export const AMENITIES = [
  'wifi',
  'privateBathroom',
  'airConditioning',
  'balcony',
  'lockers',
  'desk',
  'window',
  'accessible',
];

export const STATUS_BADGE_VARIANT = {
  pending: 'warning',
  confirmed: 'info',
  checkedIn: 'success',
  checkedOut: 'neutral',
  cancelled: 'danger',
  noShow: 'danger',
  available: 'success',
  occupied: 'info',
  reserved: 'warning',
  cleaning: 'violet',
  maintenance: 'danger',
  inactive: 'neutral',
  paid: 'success',
  partial: 'warning',
  unpaid: 'danger',
  refunded: 'neutral',
  open: 'warning',
  inProgress: 'info',
  completed: 'success',
  active: 'success',
  invited: 'info',
  suspended: 'neutral',
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

export const BED_STATUS_CLASSES = {
  available:
    'border-status-available/30 bg-status-available-soft text-status-available hover:border-status-available/60 hover:bg-status-available-soft/70',
  occupied:
    'border-status-occupied/25 bg-status-occupied-soft text-status-occupied hover:border-status-occupied/60',
  reserved:
    'border-status-reserved/30 bg-status-reserved-soft text-status-reserved hover:border-status-reserved/60',
  cleaning:
    'border-status-cleaning/25 bg-status-cleaning-soft text-status-cleaning hover:border-status-cleaning/60',
  maintenance:
    'border-status-maintenance/25 bg-status-maintenance-soft text-status-maintenance hover:border-status-maintenance/60',
  inactive: 'border-border bg-muted text-muted-foreground hover:border-border',
};

export const BED_STATUS_DOT = {
  available: 'bg-status-available',
  occupied: 'bg-status-occupied',
  reserved: 'bg-status-reserved',
  cleaning: 'bg-status-cleaning',
  maintenance: 'bg-status-maintenance',
  inactive: 'bg-status-inactive',
};

export const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

// Frankfurter covers all but MAD; MAD is filled from the complementary feed.
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'MAD', 'CHF', 'CAD'];

export const CANCELLATION_POLICIES = ['free24', 'moderate48', 'strict'];

export const ACTIVE_RESERVATION_STATUSES = ['confirmed', 'checkedIn'];
