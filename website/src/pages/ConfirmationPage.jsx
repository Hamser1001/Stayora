import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, money } from '../lib/dates.js';
import { useSeo } from '../lib/useSeo.js';
import { site } from '../content/site.js';
import { BOOKING_KEY } from './BookingPage.jsx';

export default function ConfirmationPage() {
  const [saved, setSaved] = useState(null);
  const [ready, setReady] = useState(false);

  useSeo({
    title: 'Booking received',
    description: 'Your Stayora reservation request and reference number.',
    path: '/booking/confirmation',
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BOOKING_KEY);
      setSaved(raw ? JSON.parse(raw) : null);
    } catch {
      setSaved(null);
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!saved?.booking) {
    return (
      <div className="shell confirmation">
        <div className="empty-state">
          <p className="eyebrow">Booking</p>
          <h2>Nothing to show here yet</h2>
          <p>
            This page displays the reservation you just made. If you have already sent a
            request, the reference is in the confirmation email you gave us.
          </p>
          <Link to="/booking" className="btn">
            Start a booking
          </Link>
        </div>
      </div>
    );
  }

  const { booking } = saved;
  const nights = booking.nights;

  return (
    <div className="shell confirmation">
      <div className="confirmation__inner">
        <p className="eyebrow">Request received</p>
        <h1 className="page-hero__title" style={{ fontSize: 'clamp(2.4rem, 6vw, 4.6rem)' }}>
          See you by the <em>water.</em>
        </h1>
        <p className="lede">
          Thank you, {saved.guestName?.split(' ')[0] || 'friend'}. Your bed is being held as a
          pending request — our team will confirm it and reply to {saved.email} shortly.
        </p>

        <div className="confirmation__reference">
          <span className="micro" style={{ color: 'rgba(246,239,228,0.65)' }}>
            Your reference
          </span>
          <b>{booking.reference}</b>
          <span style={{ fontSize: '0.8rem', color: 'rgba(246,239,228,0.7)' }}>
            Quote this if you write to us about the booking.
          </span>
        </div>

        <dl className="confirmation__grid">
          <div>
            <dt>Arrival</dt>
            <dd>{formatDate(booking.arrival)}</dd>
          </div>
          <div>
            <dt>Departure</dt>
            <dd>{formatDate(booking.departure)}</dd>
          </div>
          <div>
            <dt>Room</dt>
            <dd>
              {booking.roomTypeLabel} · Room {booking.roomNumber}
            </dd>
          </div>
          <div>
            <dt>Guests & nights</dt>
            <dd>
              {booking.guests} {booking.guests === 1 ? 'guest' : 'guests'} · {nights}{' '}
              {nights === 1 ? 'night' : 'nights'}
            </dd>
          </div>
          <div>
            <dt>Estimated total</dt>
            <dd>{money(booking.total, booking.currency)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd style={{ textTransform: 'capitalize' }}>{booking.status}</dd>
          </div>
        </dl>

        <div className="notice">
          <strong>What happens next</strong>
          <p>
            A person — not a system — checks the house and confirms your bed. You pay at the
            house on arrival, in cash (MAD or EUR) or by card in the office. Nothing has been
            charged online.
          </p>
        </div>

        <div className="prose">
          <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>Before you travel</h2>
          <p>
            Check-in is {site.checkIn} and check-out {site.checkOut}. Tell us your arrival time
            if it is late — someone will wait up. Bring a padlock for the dorm lockers if you
            have one.
          </p>
          <p>
            The nearest airport is Agadir–Al Massira (AGA), about 45 minutes away. We can
            arrange a transfer if you send us your flight details.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
          <Link to="/" className="btn btn--ghost">
            Back to the house
          </Link>
          <Link to="/location" className="btn btn--ghost">
            How to find us
          </Link>
          <a href={`mailto:${site.email}?subject=Booking ${booking.reference}`} className="btn">
            Email about this booking
          </a>
        </div>
      </div>
    </div>
  );
}
