import { Link } from 'react-router-dom';
import Media from '../components/Media.jsx';
import { useSeo } from '../lib/useSeo.js';
import { site } from '../content/site.js';

export default function ContactPage() {
  useSeo({
    title: 'Contact',
    description:
      'Write to Stayora in Tamraght, Morocco — questions about rooms, surf, transfers or longer stays.',
    path: '/contact',
    image: '/images/details.jpg',
  });

  return (
    <>
      <header className="page-hero">
        <div className="shell page-hero__inner">
          <p className="eyebrow">Say hello</p>
          <h1 className="page-hero__title">
            Ask us <em>anything.</em>
          </h1>
          <p className="lede">
            Rooms, boards, transfers, a wedding, a month of working from the roof — write to a
            person, not a helpdesk. We answer in English, French, Arabic and Amazigh.
          </p>
        </div>
      </header>

      <section className="page-section">
        <div className="shell contact-grid">
          <div className="prose">
            <p className="eyebrow">Direct</p>
            <h2>Talk to the house</h2>
            <div className="contact-cards">
              <div>
                <span className="micro">Email</span>
                <a href={`mailto:${site.email}`}>{site.email}</a>
              </div>
              <div>
                <span className="micro">Phone & WhatsApp</span>
                <a href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a>
                <a href={site.whatsapp} target="_blank" rel="noreferrer">
                  Message us on WhatsApp
                </a>
              </div>
              <div>
                <span className="micro">The house</span>
                <p>{site.address}</p>
                <a href={site.mapsUrl} target="_blank" rel="noreferrer">
                  {site.coordinates.lat}° N, {Math.abs(site.coordinates.lng)}° W
                </a>
              </div>
              <div>
                <span className="micro">For bookings</span>
                <p>
                  Dates, guests and rooms are booked through the website with live
                  availability — the fastest way to hold a bed.
                </p>
                <Link to="/booking" className="link-underline">
                  Go to booking <span className="arrow">→</span>
                </Link>
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
              We reply within a day. If you are already in the village, come up — the kettle is
              usually on.
            </p>
          </div>
          <div className="media media--zoom" style={{ aspectRatio: '3 / 4' }}>
            <Media
              name="details"
              alt="Moroccan craft details: zellige tiles, pottery and woven textiles"
              sizes="(max-width: 900px) 100vw, 45vw"
            />
          </div>
        </div>
      </section>

      <section className="page-section page-section--tight">
        <div className="shell">
          <div className="two-col">
            <div className="prose">
              <h2>Before you write</h2>
              <p>
                <strong>Long stays.</strong> Online booking covers up to 30 nights. For a month
                or a season, email us — we keep a couple of rooms for longer stays.
              </p>
              <p>
                <strong>Groups.</strong> Six people or more: tell us the dates and we will
                block the beds and arrange lessons together.
              </p>
              <p>
                <strong>Accessibility.</strong> The house is on a slope with stairs. Tell us
                what you need and we will be honest about whether we can accommodate it.
              </p>
            </div>
            <div className="prose">
              <h2>Already booked?</h2>
              <p>
                Your reference is on the confirmation page and in the email you gave us. Quote
                it when you write and we will find your reservation straight away.
              </p>
              <p>
                Arriving late? Send a message with your flight number and we will keep someone
                up for you.
              </p>
              <Link to="/location" className="btn btn--ghost">
                How to find us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
