import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AvailabilityForm from '../components/AvailabilityForm.jsx';
import AvailabilityList from '../components/AvailabilityList.jsx';
import Media from '../components/Media.jsx';
import Reveal from '../components/Reveal.jsx';
import { getAvailability } from '../lib/api.js';
import { defaultStay, formatRange, nightsBetween } from '../lib/dates.js';
import { useSeo } from '../lib/useSeo.js';

const INCLUDED = [
  ['Linen & towels', 'Fresh on arrival, changed for longer stays.'],
  ['Breakfast', 'Bread, eggs, fruit, coffee and mint tea on the roof.'],
  ['Board storage', 'Racks, a rinse tap and a drying line for wetsuits.'],
  ['Wi-Fi', 'Fibre through the house, good enough to work from.'],
  ['Common spaces', 'Roof terrace, salon, kitchen access and a small library.'],
  ['Local guidance', 'Tide advice, taxis, hammams and where to eat in the village.'],
];

export default function AccommodationPage() {
  const [params] = useSearchParams();
  const fallback = defaultStay();
  const initial = {
    arrival: params.get('arrival') || fallback.arrival,
    departure: params.get('departure') || fallback.departure,
    guests: Number(params.get('guests')) || fallback.guests,
  };

  const [search, setSearch] = useState(initial);
  const [state, setState] = useState({ status: 'loading', options: [] });

  useSeo({
    title: 'Accommodation',
    description:
      'Shared dorms and private rooms at Stayora in Tamraght, with live availability and nightly rates straight from the house.',
    path: '/accommodation',
    image: '/images/dorm.jpg',
  });

  const load = useCallback(async (values, signal) => {
    setState((current) => ({ ...current, status: 'loading' }));
    try {
      const data = await getAvailability(values, { signal });
      setState({ status: 'ready', options: data.options || [] });
    } catch (error) {
      if (error.name === 'AbortError') return;
      setState({ status: 'error', options: [], message: error.message });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(initial, controller.signal);
    return () => controller.abort();
    // The initial query is read once; later searches go through the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const submit = (values) => {
    setSearch(values);
    load(values);
  };

  return (
    <>
      <header className="page-hero">
        <div className="shell page-hero__inner">
          <p className="eyebrow">Sleep · Tamraght</p>
          <h1 className="page-hero__title">
            Beds by the <em>Atlantic.</em>
          </h1>
          <p className="lede">
            Thirteen rooms above the village: shared dorms for meeting people, private rooms
            for hiding from them. Every rate is per person, per night, breakfast included.
          </p>
          <div className="page-hero__foot">
            <div className="page-hero__meta">
              <span>Check-in {`15:00`}</span>
              <span>Check-out 11:00</span>
              <span>Breakfast included</span>
            </div>
            <Link to="/booking" className="link-underline">
              Book directly <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="page-section page-section--tight" aria-labelledby="search-title">
        <div className="shell">
          <div className="section-head">
            <h2 id="search-title">Check the house</h2>
            <p>Live availability from our reservation system — the same beds the front desk sees.</p>
          </div>
          <AvailabilityForm initial={initial} onSubmit={submit} busy={state.status === 'loading'} />

          <div className="avail-meta" aria-live="polite">
            <span>{formatRange(search.arrival, search.departure)}</span>
            <span>
              {nightsBetween(search.arrival, search.departure)} nights · {search.guests}{' '}
              {search.guests === 1 ? 'guest' : 'guests'}
            </span>
          </div>

          {state.status === 'loading' ? (
            <div className="loading-rows" aria-hidden="true">
              {[0, 1, 2, 3].map((key) => (
                <div className="skeleton" key={key} />
              ))}
            </div>
          ) : null}

          {state.status === 'error' ? (
            <div className="notice notice--error" role="alert">
              <strong>Availability unavailable</strong>
              <p>{state.message}</p>
              <button type="button" className="link-underline" onClick={() => load(search)}>
                Try again
              </button>
            </div>
          ) : null}

          {state.status === 'ready' && state.options.length === 0 ? (
            <div className="empty-state">
              <h3>No beds free for those dates</h3>
              <p>
                Try a different window, or write to us — we often know someone in the village
                with space.
              </p>
              <Link to="/contact" className="btn btn--ghost">
                Ask us
              </Link>
            </div>
          ) : null}

          {state.status === 'ready' && state.options.length > 0 ? (
            <AvailabilityList options={state.options} search={search} />
          ) : null}
        </div>
      </section>

      <section className="page-section" aria-labelledby="included-title">
        <div className="shell two-col">
          <div className="prose">
            <p className="eyebrow">Included</p>
            <h2 id="included-title">What comes with the bed</h2>
            <p>
              Rates include breakfast, linen, towels and the run of the house. Surf lessons,
              board hire and excursions are arranged separately — see{' '}
              <Link to="/experiences" style={{ textDecoration: 'underline' }}>
                experiences
              </Link>
              .
            </p>
          </div>
          <div>
            <ul className="community__list">
              {INCLUDED.map(([title, text], index) => (
                <li key={title}>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <span>
                    <strong style={{ display: 'block' }}>{title}</strong>
                    <span style={{ color: 'var(--ink-soft)', fontSize: '0.88rem' }}>{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="page-section page-section--tight">
        <div className="shell">
          <div className="two-col" style={{ alignItems: 'center' }}>
            <Reveal className="media media--zoom" style={{ aspectRatio: '4 / 3' }}>
              <Media name="dorm" alt="Dorm room with bunk beds, cream linen and rattan lamps" sizes="(max-width: 900px) 100vw, 50vw" />
            </Reveal>
            <div className="prose">
              <h2 style={{ fontSize: 'clamp(1.8rem, 3.4vw, 2.6rem)' }}>The house, honestly</h2>
              <p>
                It is a surf house, not a hotel. Doors are wooden, the stairs are steep, and
                the water pressure upstairs depends on how many people are showering at once.
                In exchange you get the roof at sunset, a kitchen you can actually use and
                people who will tell you where the swell is working.
              </p>
              <p>
                Rooms are cleaned daily; dorms have lockers (bring a padlock or buy one at
                reception). Quiet hours start at 23:00.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
