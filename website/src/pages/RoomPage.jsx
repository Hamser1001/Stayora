import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Media from '../components/Media.jsx';
import Magnetic from '../components/Magnetic.jsx';
import { getAvailability } from '../lib/api.js';
import { defaultStay, formatRange, money, nightsBetween } from '../lib/dates.js';
import { useSeo } from '../lib/useSeo.js';
import { amenityLabels, roomImages } from '../content/site.js';

export default function RoomPage() {
  const { roomId } = useParams();
  const [params] = useSearchParams();
  const fallback = defaultStay();
  const search = useMemo(
    () => ({
      arrival: params.get('arrival') || fallback.arrival,
      departure: params.get('departure') || fallback.departure,
      guests: Number(params.get('guests')) || fallback.guests,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params],
  );

  const [state, setState] = useState({ status: 'loading', room: null });

  useSeo({
    title: 'Room details',
    description:
      'Room details, amenities and live availability at Stayora, a surf house in Tamraght, Morocco.',
    path: `/accommodation/${roomId}`,
    image: '/images/private-room.jpg',
  });

  useEffect(() => {
    const controller = new AbortController();
    getAvailability(search, { signal: controller.signal })
      .then((data) => {
        const room = (data.options || []).find((entry) => entry.roomId === roomId);
        setState({ status: 'ready', room: room || null, nights: data.nights });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ status: 'error', room: null, message: error.message });
      });
    return () => controller.abort();
  }, [roomId, search]);

  const room = state.room;
  const art = room ? roomImages[room.type] || roomImages.dorm : roomImages.dorm;
  const nights = nightsBetween(search.arrival, search.departure);

  if (state.status === 'loading') {
    return (
      <div className="page-section" style={{ paddingTop: 'calc(var(--header-h) + 4rem)' }}>
        <div className="shell">
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      </div>
    );
  }

  if (state.status === 'error' || !room) {
    return (
      <section className="page-section" style={{ paddingTop: 'calc(var(--header-h) + 4rem)' }}>
        <div className="shell">
          <div className="empty-state">
            <p className="eyebrow">Accommodation</p>
            <h3>{state.status === 'error' ? 'We could not load this room' : 'This room is not free for those dates'}</h3>
            <p>
              {state.status === 'error'
                ? state.message
                : 'It may be fully booked, or the dates in the link have passed. Search again and we will show you what is free.'}
            </p>
            <Link to="/accommodation" className="btn">
              Back to accommodation
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const bookHref = `/booking?roomId=${room.roomId}&arrival=${search.arrival}&departure=${search.departure}&guests=${search.guests}`;

  return (
    <>
      <div className="room-hero">
        <div className="room-hero__media">
          <Media name={art.image} alt={art.alt} priority sizes="(max-width: 900px) 100vw, 55vw" />
        </div>
        <div className="room-hero__panel">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link to="/accommodation">Accommodation</Link>
            <span aria-hidden="true">/</span>
            <span>{room.typeLabel}</span>
          </nav>
          <h1>
            {room.typeLabel}
            <span className="micro" style={{ display: 'block', marginTop: '0.5rem' }}>
              Room {room.number} · {room.audience === 'female' ? 'female only' : 'mixed'} · floor{' '}
              {room.floor + 1}
            </span>
          </h1>
          <div className="room-price">
            <strong>{money(room.pricePerBed)}</strong>
            <span>per person / night</span>
          </div>
          <dl className="room-facts">
            <div>
              <dt>Sleeps</dt>
              <dd>{room.capacity}</dd>
            </div>
            <div>
              <dt>Free for your dates</dt>
              <dd>{room.bedsAvailable} beds</dd>
            </div>
            <div>
              <dt>Stay</dt>
              <dd>{formatRange(search.arrival, search.departure)}</dd>
            </div>
            <div>
              <dt>Estimated total</dt>
              <dd>
                {money(room.pricePerBed * nights * search.guests)}
                <span className="micro" style={{ display: 'block' }}>
                  {nights} nights · {search.guests} {search.guests === 1 ? 'guest' : 'guests'}
                </span>
              </dd>
            </div>
          </dl>
          <ul className="amenity-list">
            {room.amenities.map((amenity) => (
              <li key={amenity}>{amenityLabels[amenity] || amenity}</li>
            ))}
            <li>Breakfast included</li>
            <li>Linen & towels</li>
          </ul>
          {room.available ? (
            <Magnetic>
              <Link to={bookHref} className="btn">
                Book this room <span className="arrow">→</span>
              </Link>
            </Magnetic>
          ) : (
            <div className="notice">
              <strong>Not enough beds</strong>
              <p>
                This room has {room.bedsAvailable} free and your party is {search.guests}. Try
                fewer guests or another room.
              </p>
              <Link to={`/accommodation?arrival=${search.arrival}&departure=${search.departure}&guests=${search.guests}`} className="link-underline">
                See all rooms
              </Link>
            </div>
          )}
        </div>
      </div>

      <section className="page-section">
        <div className="shell two-col">
          <div className="prose">
            <p className="eyebrow">The room</p>
            <h2>Simple, cool and close to the water</h2>
            <p>
              {room.type === 'dorm'
                ? 'Solid wooden bunks, a reading light and a curtain for each bed, and enough space to repack a bag without drama. Bathrooms are shared but never far.'
                : 'A room of your own with a proper door, a window that catches the coastal light and space to hang a wetsuit. Bathrooms are private unless noted.'}
            </p>
            <p>
              Every room is a short walk from the roof, where breakfast is served and where
              most guests end up for the last hour of daylight.
            </p>
          </div>
          <div className="prose">
            <p className="eyebrow">Good to know</p>
            {[
              ['Check-in', 'From 15:00. Late arrivals are fine — tell us in advance.'],
              ['Check-out', 'By 11:00. You can leave bags and use the roof afterwards.'],
              ['Payment', 'On arrival, in cash (MAD or EUR) or by card in the office.'],
              ['Cancellation', 'Tell us as early as you can by email; the team confirms the terms when they reply.'],
            ].map(([title, text]) => (
              <p key={title}>
                <strong>{title}.</strong> {text}
              </p>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
