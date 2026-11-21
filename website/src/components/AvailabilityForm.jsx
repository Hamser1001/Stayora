import { useId, useState } from 'react';
import { addDaysISO, isoDate, nightsBetween } from '../lib/dates.js';

export default function AvailabilityForm({
  initial,
  onSubmit,
  buttonLabel = 'Check availability',
  busy = false,
}) {
  const id = useId();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState('');
  const today = isoDate();

  const update = (key) => (event) => {
    const next = { ...values, [key]: event.target.value };
    if (key === 'arrival' && next.departure <= next.arrival) {
      next.departure = addDaysISO(next.arrival, 2);
    }
    setValues(next);
    setError('');
  };

  const submit = (event) => {
    event.preventDefault();
    const nights = nightsBetween(values.arrival, values.departure);
    if (!values.arrival || !values.departure) {
      setError('Choose both an arrival and a departure date.');
      return;
    }
    if (values.arrival < today) {
      setError('Arrival cannot be in the past.');
      return;
    }
    if (nights < 1) {
      setError('Departure must be after arrival.');
      return;
    }
    if (nights > 30) {
      setError('Online stays are limited to 30 nights. Email us for longer visits.');
      return;
    }
    onSubmit({ ...values, guests: Number(values.guests) });
  };

  return (
    <form className="availability-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-arrival`}>Arrival</label>
        <input
          id={`${id}-arrival`}
          type="date"
          value={values.arrival}
          min={today}
          onChange={update('arrival')}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-departure`}>Departure</label>
        <input
          id={`${id}-departure`}
          type="date"
          value={values.departure}
          min={addDaysISO(values.arrival || today, 1)}
          onChange={update('departure')}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-guests`}>Guests</label>
        <select id={`${id}-guests`} value={values.guests} onChange={update('guests')}>
          {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>
              {count} {count === 1 ? 'guest' : 'guests'}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Checking…' : buttonLabel}
      </button>
      {error ? (
        <p className="field__error" role="alert" style={{ gridColumn: '1 / -1' }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
