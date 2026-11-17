import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { RoomsPage } from '@/pages/RoomsPage';
import { ReservationsPage } from '@/pages/ReservationsPage';
import { GuestsPage } from '@/pages/GuestsPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { HousekeepingPage } from '@/pages/HousekeepingPage';
import { StaffPage } from '@/pages/StaffPage';
import { DataPage } from '@/pages/DataPage';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { LogoMark } from '@/components/brand/Logo';

function BootScreen() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <LogoMark className="size-11 animate-pulse bg-primary text-primary-foreground" />
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {t('common.loading')}
        </p>
      </div>
    </div>
  );
}

function RequireAuth({ children, allowPasswordChange = false }) {
  const { isAuthenticated, booting, mustChangePassword } = useAuth();
  const location = useLocation();
  if (booting) return <BootScreen />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (mustChangePassword && !allowPasswordChange) {
    return <Navigate to="/change-password" replace />;
  }
  return children;
}

function PublicOnly({ children }) {
  const { isAuthenticated, booting } = useAuth();
  if (booting) return <BootScreen />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/change-password"
        element={
          <RequireAuth allowPasswordChange>
            <ChangePasswordPage />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="rooms" element={<RoomsPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="guests" element={<GuestsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="housekeeping" element={<HousekeepingPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="data" element={<DataPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
