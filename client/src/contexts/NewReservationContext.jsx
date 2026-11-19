import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReservationFormDialog } from '@/features/reservations/ReservationFormDialog';

const NewReservationContext = createContext(null);

/**
 * Opens the reservation form from anywhere in the app — sidebar, dashboard,
 * anywhere else — without routing through the reservations listing first.
 * Saving a booking then moves to that reservation, which the reservations page
 * already handles via its `focus` parameter.
 */
export function NewReservationProvider({ children }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const openNewReservation = useCallback(() => setOpen(true), []);

  const handleSaved = useCallback(
    (created) => {
      if (created?.id) navigate(`/reservations?focus=${created.id}`);
    },
    [navigate],
  );

  const value = useMemo(() => ({ openNewReservation }), [openNewReservation]);

  return (
    <NewReservationContext.Provider value={value}>
      {children}
      <ReservationFormDialog open={open} onOpenChange={setOpen} onSaved={handleSaved} />
    </NewReservationContext.Provider>
  );
}

export function useNewReservation() {
  const context = useContext(NewReservationContext);
  if (!context) throw new Error('useNewReservation must be used inside NewReservationProvider');
  return context;
}
