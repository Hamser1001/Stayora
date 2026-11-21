import { useState } from 'react';
import { Link } from 'react-router-dom';
import MapCanvas from '../components/MapCanvas.jsx';
import Media from '../components/Media.jsx';
import { useSeo } from '../lib/useSeo.js';
import { practical, site, spots } from '../content/site.js';

export default function LocationPage() {
  const [activeId, setActiveId] = useState('tamraght');
  const active = spots.find((spot) => spot.id === activeId) || spots[0];

  useSeo({
    title: 'Location',
    description:
      'Where Stayora is: Tamraght, between Aourir and Taghazout on Morocco’s Atlantic coast, with the surf breaks around the house.',
    path: '/location',
    image: '/images/tamraght-hillside.jpg',
  });

  return (
    <>
      <header className="page-hero">
        <div className="shell page-hero__inner">
          <p className="eyebrow">Finding us</p>
          <h1 className="page-hero__title">
            Tamraght, <em>Morocco.</em>
          </h1>
          <p className="lede">
            On the coast road between Agadir and Taghazout, where the Atlantic runs into the
            Anti-Atlas. Our door is a five-minute walk from the water.
          </p>
          <div className="page-hero__foot">
            <div className="page-hero__meta">
              <span>{site.coordinates.lat}° N</span>
              <span>{Math.abs(site.coordinates.lng)}° W</span>
              <span>45 min from Agadir airport</span>
            </div>
            <a href={site.mapsUrl} target="_blank" rel="noreferrer" className="link-underline">
              Open directions <span className="arrow">→</span>
            </a>
          </div>
        </div>
      </header>

      <section className="page-section">
        <div className="shell">
          <div className="section-head">
            <h2>The coast around the house</h2>
            <p>
              Tap a name to see it on the map. Positions come from the spots&apos; real
              coordinates; the drawing is a locator, not a survey.
            </p>
          </div>
          <div className="map-layout">
            <MapCanvas activeId={activeId} onActivate={setActiveId} />
            <div>
              <ul className="spot-list" aria-label="Surf breaks and villages">
                {spots.map((spot) => (
                  <li key={spot.id} data-active={spot.id === activeId}>
                    <button
                      type="button"
                      onClick={() => setActiveId(spot.id)}
                      aria-pressed={spot.id === activeId}
                    >
                      <strong>{spot.name}</strong>
                      <small>{spot.kind}</small>
                      <span className="spot-list__level">{spot.level}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="micro" style={{ marginTop: '1rem' }}>
            Selected: {active.name} · {active.lat.toFixed(4)}° N, {Math.abs(active.lng).toFixed(4)}° W
          </p>
        </div>
      </section>

      <section className="page-section page-section--tight">
        <div className="shell two-col">
          <div className="prose">
            <p className="eyebrow">Getting here</p>
            <h2>From the airport or Agadir</h2>
            <p>
              Fly into Agadir–Al Massira (AGA). The drive north along the N1 takes about 45 to
              55 minutes to Tamraght, past Aourir and its banana plantations.
            </p>
            <p>
              Private transfers can be arranged by the house and are the easiest option with
              boards and bags. Shared taxis and buses run from Agadir; we will send the details
              when you book.
            </p>
            <a href={site.mapsUrl} target="_blank" rel="noreferrer" className="link-underline">
              Google Maps directions <span className="arrow">→</span>
            </a>
          </div>
          <div>
            <ul className="spot-list">
              {practical.map((row) => (
                <li key={row.label}>
                  <div style={{ padding: '0.9rem 0' }}>
                    <small>{row.label}</small>
                    <p style={{ fontFamily: 'var(--display)', fontSize: '1.1rem', marginTop: '0.15rem' }}>
                      {row.value}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="page-section page-section--tight">
        <div className="shell">
          <div className="two-col" style={{ alignItems: 'center' }}>
            <div className="prose">
              <h2>What it sounds like here</h2>
              <p>
                Mopeds on the main road, the call to prayer, gulls, a distant set breaking on
                the rocks, and someone on the roof asking if you want tea. That is the whole
                soundtrack.
              </p>
              <Link to="/booking" className="btn">
                Book your stay
              </Link>
            </div>
            <div className="media media--zoom" style={{ aspectRatio: '16 / 10' }}>
              <Media
                name="hero-atlantic"
                alt="The Atlantic coast at dawn with waves breaking below headlands"
                sizes="(max-width: 900px) 100vw, 50vw"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
