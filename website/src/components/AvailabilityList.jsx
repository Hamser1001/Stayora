import { Link } from 'react-router-dom';
import { money } from '../lib/dates.js';
import { amenityLabels } from '../content/site.js';

function AmenityTags({ amenities = [] }) {
  return (
    <p className="avail-row__tags">
      {amenities.slice(0, 3).map((amenity) => (
        <span key={amenity}>{amenityLabels[amenity] || amenity}</span>
      ))}
    </p>
  );
}

export default function AvailabilityList({ options = [], onSelect, selectedId, search }) {
  return (
    <ul className="avail-list">
      {options.map((room) => {
        const unavailable = !room.available;
        return (
          <li key={room.roomId} className={`avail-row${unavailable ? ' avail-row--out' : ''}`}>
            <div className="avail-row__name">
              <h3>
                {room.typeLabel} <span className="micro">· Room {room.number}</span>
              </h3>
              <AmenityTags amenities={room.amenities} />
            </div>
            <p className="avail-row__beds">
              {unavailable
                ? `Only ${room.bedsAvailable} ${room.bedsAvailable === 1 ? 'bed' : 'beds'} free — this room needs ${search?.guests || 1}`
                : `${room.bedsAvailable} of ${room.capacity} ${room.capacity === 1 ? 'bed' : 'beds'} free`}
            </p>
            <div className="avail-row__price">
              <strong>{money(room.pricePerBed)}</strong>
              <span>per person / night</span>
            </div>
            {onSelect ? (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={unavailable}
                onClick={() => onSelect(room)}
                aria-pressed={selectedId === room.roomId}
              >
                {selectedId === room.roomId ? 'Selected' : 'Select'}
              </button>
            ) : (
              <Link
                to={`/accommodation/${room.roomId}?arrival=${search.arrival}&departure=${search.departure}&guests=${search.guests}`}
                className="link-underline"
              >
                View room <span className="arrow">→</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
