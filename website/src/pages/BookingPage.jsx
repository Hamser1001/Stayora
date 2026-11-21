import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AvailabilityForm from '../components/AvailabilityForm.jsx';
import Media from '../components/Media.jsx';
import { createBooking, getAvailability } from '../lib/api.js';
import { defaultStay, formatDate, formatRange, money, nightsBetween } from '../lib/dates.js';
import { useSeo } from '../lib/useSeo.js';
import { roomImages } from '../content/site.js';

export const BOOKING_KEY = 'stayora:last-booking';

const EMPTY_GUEST = {
  name: '',
  email: '',
  phone: '',
  country: '',
  notes: '',
  company: '',
};

function validateGuest(values) {
  const errors = {};
  if (values.name.trim().length < 2) errors.name = 'Please tell us your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) {
    errors.email = 'We need a valid email to confirm your booking.';
  }
  if (values.phone.replace(/[^0-9]/g, '').length < 6) {
    errors.phone = 'Please add a phone number we can reach you on.';
  }
  if (values.notes.length > 500) errors.notes = 'Please keep notes under 500 characters.';
  return errors;
}

export default function BookingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mainRef = useRef(null);
  const fallback = defaultStay();

  const initial = useMemo(
    () => ({
      arrival: params.get('arrival') || fallback.arrival,
      departure: params.get('departure') || fallback.departure,
      guests: Number(params.get('guests')) || fallback.guests,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params],
  );
  const requestedRoom = params.get('roomId');

  const [step, setStep] = useState(requestedRoom ? 2 : 1);
  const [search, setSearch] = useState(initial);
  const [rooms, setRooms] = useState({ status: 'idle', options: [], error: null });
  const [selectedId, setSelectedId] = useState(requestedRoom || null);
  const [guest, setGuest] = useState(EMPTY_GUEST);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useSeo({
    title: 'Book your stay',
    description:
      'Check live availability at Stayora in Tamraght and request a bed. No card needed online — the team confirms every booking by hand.',
    path: '/booking',
    image: '/images/private-room.jpg',
  });

  const loadRooms = async (values) => {
    setRooms({ status: 'loading', options: [], error: null });
    setSelectedId(null);
    try {
      const data = await getAvailability(values);
      setRooms({ status: 'ready', options: data.options || [], error: null });
    } catch (error) {
      setRooms({ status: 'error', options: [], error: error.message });
    }
  };

  useEffect(() => {
    if (requestedRoom) {
      loadRooms(initial);
      setStep(2);
    }
    // Only the initial deep-link triggers an automatic search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = rooms.options.find((room) => room.roomId === selectedId) || null;
  const nights = nightsBetween(search.arrival, search.departure);
  const total = selected ? selected.pricePerBed * nights * search.guests : null;

  const goTo = (next) => {
    setStep(next);
    setSubmitError('');
    requestAnimationFrame(() => {
      mainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const searchStay = (values) => {
    setSearch(values);
    loadRooms(values);
    goTo(2);
  };

  const submitBooking = async (event) => {
    event.preventDefault();
    const found = validateGuest(guest);
    setErrors(found);
    if (Object.keys(found).length) {
      document.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    if (!selected) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const booking = await createBooking({
        roomId: selected.roomId,
        arrival: search.arrival,
        departure: search.departure,
        guests: Number(search.guests),
        guest: {
          name: guest.name.trim(),
          email: guest.email.trim(),
          phone: guest.phone.trim(),
          country: guest.country.trim(),
          notes: guest.notes.trim(),
        },
        company: guest.company,
      });

      sessionStorage.setItem(
        BOOKING_KEY,
        JSON.stringify({
          booking,
          guestName: guest.name.trim(),
          email: guest.email.trim(),
          savedAt: new Date().toISOString(),
        }),
      );
      navigate('/booking/confirmation', { replace: true });
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const art = selected ? roomImages[selected.type] || roomImages.dorm : roomImages.dorm;

  return (
    <div className="shell">
      <header style={{ paddingTop: 'calc(var(--header-h) + clamp(2rem, 5vw, 3.5rem))' }}>
        <p className="eyebrow">Booking</p>
        <h1 className="page-hero__title" style={{ fontSize: 'clamp(2.4rem, 6vw, 4.6rem)', margin: '0.6rem 0 1rem' }}>
          Hold your <em>bed.</em>
        </h1>
        <p className="lede">
          Real availability, real rooms. Nothing is charged online — we confirm every booking
          by hand and you settle at the house.
        </p>
      </header>

      <div className="booking-shell" ref={mainRef}>
        <aside className="booking-aside" aria-label="Your stay">
          <div className="media" style={{ aspectRatio: '16 / 10' }}>
            <Media name={art.image} alt={art.alt} sizes="(max-width: 1000px) 100vw, 30vw" />
          </div>
          <h2 className="booking-aside__title">
            {selected ? `${selected.typeLabel} · Room ${selected.number}` : 'Your stay'}
          </h2>
          <div className="booking-summary">
            <div className="booking-summary__row">
              <span>Arrival</span>
              <span>{formatDate(search.arrival)}</span>
            </div>
            <div className="booking-summary__row">
              <span>Departure</span>
              <span>{formatDate(search.departure)}</span>
            </div>
            <div className="booking-summary__row">
              <span>Guests</span>
              <span>
                {search.guests} {search.guests === 1 ? 'guest' : 'guests'} · {nights}{' '}
                {nights === 1 ? 'night' : 'nights'}
              </span>
            </div>
            {selected ? (
              <div className="booking-summary__row">
                <span>Rate</span>
                <span>
                  {money(selected.pricePerBed)} per person / night
                </span>
              </div>
            ) : null}
          </div>
          <div className="booking-summary__total">
            <span className="micro">Estimated total</span>
            <strong>{total ? money(total) : '—'}</strong>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
            Payable at the house on arrival. Your booking stays <em>pending</em> until the team
            confirms it.
          </p>
          <Link to="/accommodation" className="link-underline">
            Change dates or room
          </Link>
        </aside>

        <div className="booking-main">
          <ol className="steps" aria-label="Booking steps">
            {[
              ['Dates', '01'],
              ['Room', '02'],
              ['Details', '03'],
            ].map(([label, number], index) => {
              const state = step === index + 1 ? 'current' : step > index + 1 ? 'done' : 'todo';
              return (
                <li key={label} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
                  <b>{number}</b>
                  {label}
                </li>
              );
            })}
          </ol>

          {step === 1 ? (
            <section className="booking-step" aria-labelledby="step-dates">
              <h2 id="step-dates">When are you coming?</h2>
              <AvailabilityForm
                initial={search}
                onSubmit={searchStay}
                buttonLabel="Search rooms"
                busy={rooms.status === 'loading'}
              />
              <p className="field__hint" style={{ maxWidth: '48ch' }}>
                Stays of up to 30 nights can be booked online. For longer visits, write to us
                and we will arrange it directly.
              </p>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="booking-step" aria-labelledby="step-room">
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.6rem' }}>
                <h2 id="step-room">Choose your room</h2>
                <button type="button" className="link-underline" onClick={() => goTo(1)}>
                  ← Change dates
                </button>
              </div>
              <p className="micro">
                {formatRange(search.arrival, search.departure)} · {nights}{' '}
                {nights === 1 ? 'night' : 'nights'} · {search.guests}{' '}
                {search.guests === 1 ? 'guest' : 'guests'}
              </p>

              {rooms.status === 'loading' || rooms.status === 'idle' ? (
                <div className="loading-rows" aria-hidden="true">
                  {[0, 1, 2].map((key) => (
                    <div className="skeleton" key={key} />
                  ))}
                </div>
              ) : null}

              {rooms.status === 'error' ? (
                <div className="notice notice--error" role="alert">
                  <strong>Could not load availability</strong>
                  <p>{rooms.error}</p>
                  <button type="button" className="link-underline" onClick={() => loadRooms(search)}>
                    Try again
                  </button>
                </div>
              ) : null}

              {rooms.status === 'ready' && rooms.options.length === 0 ? (
                <div className="empty-state">
                  <h3>No beds free for this window</h3>
                  <p>Try shifting your dates by a few days, or write to us and we will help.</p>
                  <button type="button" className="btn btn--ghost" onClick={() => goTo(1)}>
                    Change dates
                  </button>
                </div>
              ) : null}

              {rooms.status === 'ready' && rooms.options.length ? (
                <>
                  <div className="room-options" role="group" aria-label="Available rooms">
                    {rooms.options.map((room) => (
                      <button
                        key={room.roomId}
                        type="button"
                        className="room-option"
                        aria-pressed={selectedId === room.roomId}
                        disabled={!room.available}
                        onClick={() => {
                          setSelectedId(room.roomId);
                          setSubmitError('');
                        }}
                      >
                        <span className="room-option__radio" aria-hidden="true" />
                        <span className="room-option__body">
                          <strong>
                            {room.typeLabel} · Room {room.number}
                          </strong>
                          <small>
                            {room.available
                              ? `${room.bedsAvailable} ${room.bedsAvailable === 1 ? 'bed' : 'beds'} free · sleeps ${room.capacity}`
                              : 'Not enough beds for your party'}
                          </small>
                        </span>
                        <span className="room-option__price">
                          <strong>{money(room.total)}</strong>
                          <small>
                            {money(room.pricePerBed)} / person / night
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="booking-step__actions">
                    <p className="field__hint">
                      {selected
                        ? `${selected.typeLabel} selected — ${money(selected.total)} for ${nights} ${
                            nights === 1 ? 'night' : 'nights'
                          }`
                        : 'Select a room to continue.'}
                    </p>
                    <button
                      type="button"
                      className="btn"
                      disabled={!selected}
                      onClick={() => goTo(3)}
                    >
                      Continue <span className="arrow">→</span>
                    </button>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {step === 3 ? (
            <section className="booking-step" aria-labelledby="step-guest">
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.6rem' }}>
                <h2 id="step-guest">Who is coming?</h2>
                <button type="button" className="link-underline" onClick={() => goTo(2)}>
                  ← Change room
                </button>
              </div>

              <form className="booking-form" onSubmit={submitBooking} noValidate>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="guest-name">Full name</label>
                    <input
                      id="guest-name"
                      autoComplete="name"
                      value={guest.name}
                      onChange={(event) => setGuest({ ...guest, name: event.target.value })}
                      aria-invalid={errors.name ? 'true' : undefined}
                      required
                    />
                    {errors.name ? <p className="field__error">{errors.name}</p> : null}
                  </div>
                  <div className="field">
                    <label htmlFor="guest-email">Email</label>
                    <input
                      id="guest-email"
                      type="email"
                      autoComplete="email"
                      value={guest.email}
                      onChange={(event) => setGuest({ ...guest, email: event.target.value })}
                      aria-invalid={errors.email ? 'true' : undefined}
                      required
                    />
                    {errors.email ? <p className="field__error">{errors.email}</p> : null}
                  </div>
                </div>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="guest-phone">Phone / WhatsApp</label>
                    <input
                      id="guest-phone"
                      type="tel"
                      autoComplete="tel"
                      value={guest.phone}
                      onChange={(event) => setGuest({ ...guest, phone: event.target.value })}
                      aria-invalid={errors.phone ? 'true' : undefined}
                      required
                    />
                    {errors.phone ? <p className="field__error">{errors.phone}</p> : null}
                  </div>
                  <div className="field">
                    <label htmlFor="guest-country">Country</label>
                    <input
                      id="guest-country"
                      autoComplete="country-name"
                      value={guest.country}
                      onChange={(event) => setGuest({ ...guest, country: event.target.value })}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="guest-notes">Anything we should know? (optional)</label>
                  <textarea
                    id="guest-notes"
                    value={guest.notes}
                    onChange={(event) => setGuest({ ...guest, notes: event.target.value })}
                    aria-invalid={errors.notes ? 'true' : undefined}
                    maxLength={500}
                    placeholder="Arrival time, dietary needs, a lesson on the first morning…"
                  />
                  {errors.notes ? <p className="field__error">{errors.notes}</p> : null}
                </div>

                {/* Bot trap — hidden from people and assistive technology alike. */}
                <div className="hp-field" aria-hidden="true">
                  <label htmlFor="guest-company">Company</label>
                  <input
                    id="guest-company"
                    tabIndex={-1}
                    autoComplete="off"
                    value={guest.company}
                    onChange={(event) => setGuest({ ...guest, company: event.target.value })}
                  />
                </div>

                <p style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                  By sending this request you agree to be contacted about your stay. This
                  creates a reservation request — not a payment.
                </p>

                {submitError ? (
                  <div className="notice notice--error" role="alert">
                    <strong>We could not save the booking</strong>
                    <p>{submitError}</p>
                  </div>
                ) : null}

                <div className="booking-step__actions">
                  <p className="field__hint">
                    {selected && total ? `${money(total)} due at the house` : ''}
                  </p>
                  <button type="submit" className="btn" disabled={submitting || !selected}>
                    {submitting ? 'Sending…' : 'Request this bed'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
