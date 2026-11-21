import { Link } from 'react-router-dom';
import Media from '../components/Media.jsx';
import Marquee from '../components/Marquee.jsx';
import Reveal from '../components/Reveal.jsx';
import { useSeo } from '../lib/useSeo.js';
import { experienceItems } from '../content/site.js';

export default function ExperiencesPage() {
  useSeo({
    title: 'Experiences',
    description:
      'Surf lessons, board hire, rooftop mornings, family dinners and days along the Moroccan coast — what a stay at Stayora actually feels like.',
    path: '/experiences',
    image: '/images/surf-lesson.jpg',
  });

  return (
    <>
      <header className="page-hero">
        <div className="shell page-hero__inner">
          <p className="eyebrow">Days at Stayora</p>
          <h1 className="page-hero__title">
            Ride. Connect. <em>Repeat.</em>
          </h1>
          <p className="lede">
            The rhythm here is simple: water in the morning, shade in the afternoon, one long
            table in the evening. Everything else is optional.
          </p>
          <div className="page-hero__foot">
            <div className="page-hero__meta">
              <span>Lessons daily</span>
              <span>Boards included</span>
              <span>All levels</span>
            </div>
            <Link to="/booking" className="link-underline">
              Book your stay <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="page-section">
        <div className="shell">
          {experienceItems.map((item, index) => (
            <article
              key={item.id}
              className={`split${index % 2 === 1 ? ' split--reverse' : ''}`}
              style={{ paddingBlock: 'clamp(1.5rem, 4vw, 3rem)' }}
            >
              <div className="split__text">
                <p className="eyebrow">{String(index + 1).padStart(2, '0')} — {item.meta}</p>
                <Reveal>
                  <h2 className="scene__title" style={{ fontSize: 'clamp(2rem, 4.4vw, 3.6rem)' }}>
                    {item.title}
                  </h2>
                </Reveal>
                <Reveal delay={0.08}>
                  <p style={{ color: 'var(--ink-soft)' }}>{item.text}</p>
                </Reveal>
              </div>
              <div className="split__media-a" style={{ aspectRatio: index % 2 === 1 ? '5 / 4' : '4 / 3' }}>
                <div className="media media--zoom">
                  <Media
                    name={item.image}
                    alt={item.alt}
                    sizes="(max-width: 900px) 100vw, 50vw"
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Marquee phrases={['Swell before breakfast', 'Mint tea at four', 'Taghazout, fifteen minutes', 'One more wave']} />

      <section className="page-section">
        <div className="shell two-col">
          <div className="prose">
            <p className="eyebrow">Practical</p>
            <h2>How extras work</h2>
            <p>
              Accommodation is booked online with live availability. Lessons, board hire and
              excursions are arranged once you are here — your host confirms the price and the
              plan before anything is committed, and it is settled at the house.
            </p>
            <p>
              If you want a lesson waiting for you on the morning you arrive, say so in the
              notes field when booking and we will try to line it up.
            </p>
            <Link to="/booking" className="btn btn--ghost">
              Book your stay
            </Link>
          </div>
          <div className="prose">
            <p className="eyebrow">Levels</p>
            <h2>Who this coast is for</h2>
            <p>
              <strong>First-timers.</strong> Sandy beach breaks, small groups and instructors
              who teach in the shallows. Most people stand up on day one.
            </p>
            <p>
              <strong>Improvers.</strong> When the swell is right we head to the point breaks
              around Taghazout for longer rides and cleaner walls.
            </p>
            <p>
              <strong>Experienced surfers.</strong> Anchor Point, Hash Point and the reefs north
              of the village are serious waves. We will tell you honestly what the day looks
              like — and when it is beyond a good idea.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
