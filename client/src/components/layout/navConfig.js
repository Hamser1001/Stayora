import {
  BarChart3,
  BedDouble,
  Brush,
  Cable,
  CalendarDays,
  FileSpreadsheet,
  Globe,
  LayoutDashboard,
  ReceiptText,
  Settings,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';

export const NAV_GROUPS = [
  {
    labelKey: 'nav.overview',
    items: [{ to: '/', key: 'dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    labelKey: 'nav.operations',
    items: [
      { to: '/rooms', key: 'rooms', icon: BedDouble },
      { to: '/reservations', key: 'reservations', icon: CalendarDays },
      { to: '/guests', key: 'guests', icon: Users },
    ],
  },
  {
    labelKey: 'nav.finance',
    items: [
      { to: '/payments', key: 'payments', icon: Wallet },
      { to: '/expenses', key: 'expenses', icon: ReceiptText },
    ],
  },
  {
    labelKey: 'nav.team',
    items: [
      { to: '/housekeeping', key: 'housekeeping', icon: Brush },
      { to: '/staff', key: 'staff', icon: UserCog },
    ],
  },
  {
    labelKey: 'nav.system',
    items: [
      { to: '/reports', key: 'reports', icon: BarChart3 },
      { to: '/data', key: 'data', icon: FileSpreadsheet },
      { to: '/cms', key: 'cms', icon: Globe },
      { to: '/integrations', key: 'integrations', icon: Cable },
      { to: '/settings', key: 'settings', icon: Settings },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export const QUICK_SEARCH_ACTIONS = [
  { key: 'newReservation', labelKey: 'dashboard.newReservation', to: '/reservations?new=1', icon: CalendarDays, module: 'reservations' },
  { key: 'addRoom', labelKey: 'rooms.addRoom', to: '/rooms?new=1', icon: BedDouble, module: 'rooms' },
  { key: 'addGuest', labelKey: 'guests.add', to: '/guests?new=1', icon: Users, module: 'guests' },
  { key: 'addExpense', labelKey: 'expenses.add', to: '/expenses?new=1', icon: ReceiptText, module: 'expenses' },
];
