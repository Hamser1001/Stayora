import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Media from '../components/Media.jsx';
import TideImage from '../components/TideImage.jsx';
import ChapterStory from '../components/ChapterStory.jsx';
import WaveDivider from '../components/WaveDivider.jsx';
import Magnetic from '../components/Magnetic.jsx';
import Marquee from '../components/Marquee.jsx';
import Reveal from '../components/Reveal.jsx';
import { getAvailability } from '../lib/api.js';
import { defaultStay, money } from '../lib/dates.js';
import { splitWords } from '../lib/splitWords.js';
import { useReducedMotion } from '../lib/useReducedMotion.js';
import { useSeo } from '../lib/useSeo.js';
import { roomImages, site } from '../content/site.js';

gsap.registerPlugin(ScrollTrigger);

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'LodgingBusiness',
  name: 'Stayora',
  description:
    'A small surf house above the Atlantic in Tamraght, Morocco, with shared and private rooms, surf lessons and a rooftop over the ocean.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Tamraght',
    addressLocality: 'Aourir',
    postalCode: '80000',
    addressRegion: 'Souss-Massa',
    addressCountry: 'MA',
  },
  geo: { '@type': 'GeoCoordinates', latitude: 30.5064, longitude: -9.653 },
  amenityFeature: [
    { '@type': 'LocationFeatureSpecification', name: 'Surf lessons', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Rooftop terrace', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Free Wi-Fi', value: true },
  ],
  priceRange: '€€',
  currenciesAccepted: 'EUR, MAD',
  checkinTime: '15:00',
  checkoutTime: '11:00',
};

const GALLERY = [
  { image: 'surf-lesson', alt: 'A surf lesson on a Moroccan beach', title: 'Learn', meta: 'Daily lessons' },
  { image: 'lineup', alt: 'Surfers waiting in the Atlantic lineup', title: 'Ride', meta: 'Boards included' },
  { image: 'rooftop', alt: 'Rooftop terrace above the Atlantic', title: 'Slow down', meta: 'Rooftop & tea' },
  { image: 'dinner', alt: 'Communal dinner with tagine and lanterns', title: 'Gather', meta: 'One long table' },
];

export default function HomePage() {
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const hscrollRef = useRef(null);
  const hscrollBarRef = useRef(null);
  const reduced = useReducedMotion();
  const [availability, setAvailability] = useState({ status: 'loading', options: [] });
  const stay = useRef(defaultStay());

  useSeo({
    title: 'Surf & stay in Tamraght',
    description:
      'Stayora is a surf house between the Atlantic and the Anti-Atlas: beds by the ocean, lessons every morning and a rooftop for the long sunsets in Tamraght, Morocco.',
    path: '/',
    jsonLd: STRUCTURED_DATA,
  });

  useEffect(() => {
    const controller = new AbortController();
    getAvailability(stay.current, { signal: controller.signal })
      .then((data) => setAvailability({ status: 'ready', options: data.options || [] }))
      .catch((error) => {
        if (error.name !== 'AbortError') setAvailability({ status: 'error', options: [] });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (reduced) return undefined;

    // A background tab never paints; skip the choreography so the page is
    // simply readable instead of frozen halfway through a tween.
    if (document.visibilityState === 'hidden') return undefined;

    const context = gsap.context(() => {
      /* ------------------------------ hero ------------------------------ */
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.08 });
      intro
        .from('.hero__title-line > span', {
          yPercent: 112,
          rotate: 2.4,
          duration: 1.25,
          stagger: 0.1,
        })
        .from('.hero__meta', { y: 14, autoAlpha: 0, duration: 0.8 }, '-=0.8')
        .from('.hero__intro', { y: 18, autoAlpha: 0, duration: 0.9 }, '-=0.7')
        .from('.hero__actions > *', { y: 14, autoAlpha: 0, stagger: 0.08, duration: 0.8 }, '-=0.65')
        .from('.hero__scroll', { autoAlpha: 0, duration: 0.6 }, '-=0.5');

      gsap.to('.hero__media img', {
        scale: 1.1,
        yPercent: 9,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      });

      // Two atmosphere layers moving at different depths.
      gsap.to('.hero__glow--a', {
        yPercent: 22,
        xPercent: -5,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to('.hero__glow--b', {
        yPercent: -16,
        xPercent: 7,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      });

      /* ------------------------- masked headings ------------------------ */
      gsap.utils.toArray('[data-split-words]').forEach((heading) => {
        const words = splitWords(heading);
        if (!words.length) return;
        gsap.fromTo(
          words,
          { yPercent: 118 },
          {
            yPercent: 0,
            duration: 1,
            stagger: 0.045,
            ease: 'power4.out',
            immediateRender: false,
            scrollTrigger: { trigger: heading, start: 'top 88%', once: true },
          },
        );
      });

      /* ---------------------------- intro strip ------------------------- */
      gsap.from('.intro-strip__item', {
        y: 26,
        autoAlpha: 0,
        duration: 0.9,
        stagger: 0.1,
        ease: 'power3.out',
        immediateRender: false,
        scrollTrigger: { trigger: '.intro-strip', start: 'top 86%', once: true },
      });

      /* ---------------------------- awakening --------------------------- */
      const awake = gsap.timeline({
        scrollTrigger: {
          trigger: '.awakening',
          start: 'top top',
          end: '+=60%',
          pin: true,
          scrub: 0.7,
          anticipatePin: 1,
        },
      });
      awake
        .fromTo(
          '.awakening__media img',
          { scale: 1.12, yPercent: -3 },
          { scale: 1, yPercent: 3, ease: 'none' },
          0,
        )
        .to('.awakening__veil', { opacity: 0.88, ease: 'none' }, 0)
        .fromTo('.awakening__quote', { yPercent: 6 }, { yPercent: -6, ease: 'none' }, 0)
        .fromTo('.awakening__note', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.12);

      gsap.to('.awakening__media img', {
        filter: 'saturate(1.08)',
        ease: 'none',
        scrollTrigger: { trigger: '.awakening', start: 'top bottom', end: 'top top', scrub: true },
      });

      /* ----------------------- horizontal gallery ----------------------- */
      const media = gsap.matchMedia();

      media.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
        const track = trackRef.current;
        const section = hscrollRef.current;
        const bar = hscrollBarRef.current;
        if (!track || !section) return undefined;

        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 24);
        const tween = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              if (bar) gsap.set(bar, { scaleX: Math.max(0.02, self.progress) });
            },
          },
        });
        return () => tween.scrollTrigger?.kill();
      });

      media.add('(max-width: 900px), (prefers-reduced-motion: reduce)', () => {
        const bar = hscrollBarRef.current;
        if (bar) gsap.set(bar, { scaleX: 1, opacity: 0.35 });
        return undefined;
      });

      /* ------------------------------- CTA ------------------------------ */
      gsap.fromTo(
        '.cta-band__media img',
        { scale: 1.16, yPercent: -4 },
        {
          scale: 1,
          yPercent: 4,
          ease: 'none',
          scrollTrigger: {
            trigger: '.cta-band',
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        },
      );

      /* --------------------------- community ---------------------------- */
      gsap.from('.community__list li', {
        x: -14,
        autoAlpha: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'power2.out',
        immediateRender: false,
        scrollTrigger: { trigger: '.community__list', start: 'top 88%', once: true },
      });

      media.add('(min-width: 701px)', () => {
        const root = rootRef.current;
        if (!root) return undefined;
        const layers = [
          ['.community__media .tide__layer img', 6],
          ['.community__media--offset .tide__layer img', -8],
        ];
        const tweens = layers.map(([selector, shift]) => {
          const image = root.querySelector(selector);
          if (!image) return null;
          return gsap.fromTo(
            image,
            { yPercent: -shift },
            {
              yPercent: shift,
              ease: 'none',
              scrollTrigger: {
                trigger: '.community',
                start: 'top bottom',
                end: 'bottom top',
                scrub: true,
              },
            },
          );
        });
        return () => tweens.forEach((tween) => tween?.scrollTrigger?.kill());
      });

      media.add('(max-width: 1024px)', () => {
        gsap.utils.toArray('[data-parallax-soft]').forEach((node) => {
          gsap.to(node, {
            y: -24,
            ease: 'none',
            scrollTrigger: {
              trigger: node,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          });
        });
      });
    }, rootRef);

    const refresh = setTimeout(() => ScrollTrigger.refresh(), 350);
    return () => {
      clearTimeout(refresh);
      context.revert();
    };
  }, [reduced]);

  useEffect(() => {
    const id = setTimeout(() => ScrollTrigger.refresh(), 220);
    return () => clearTimeout(id);
  }, [availability.status]);

  const preview = availability.options
    .filter((room) => room.available)
    .filter((room, index, list) => list.findIndex((entry) => entry.type === room.type) === index)
    .slice(0, 3);

  const fromPrice = availability.options.length
    ? Math.min(...availability.options.map((room) => room.pricePerBed))
    : null;

  return (
    <div ref={rootRef}>
      {/* ------------------------------- hero ------------------------------- */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__media">
          <Media
            name="hero-atlantic"
            alt="Atlantic swell breaking off the Moroccan coast at first light"
            priority
            sizes="100vw"
          />
        </div>
        <div className="hero__atmosphere" aria-hidden="true">
          <span className="hero__glow hero__glow--a" />
          <span className="hero__glow hero__glow--b" />
        </div>
        <div className="hero__veil" />
        <div className="hero__inner shell">
          <div className="hero__meta">
            <span>Tamraght · Aourir · Morocco</span>
            <span>Surf house · Tamraght village</span>
          </div>
          <h1 className="hero__title" id="hero-title">
            <span className="hero__title-line">
              <span>Find</span>
            </span>
            <span className="hero__title-line">
              <span>Your</span>
            </span>
            <span className="hero__title-line">
              <span>
                <em>Wave.</em>
              </span>
            </span>
          </h1>
          <div className="hero__foot">
            <p className="hero__intro">
              A small house on the Atlantic edge of Tamraght. Beds made for salt-water
              mornings, a rooftop for the long light, and a table where everyone ends up
              sitting together.
            </p>
            <div className="hero__actions">
              <Magnetic>
                <Link to="/booking" className="btn btn--light">
                  Book your stay <span className="arrow">→</span>
                </Link>
              </Magnetic>
              <a href="#awakening" className="btn btn--onDark">
                Explore Stayora
              </a>
            </div>
          </div>
        </div>
        <div className="hero__scroll" aria-hidden="true">
          Scroll
          <i />
        </div>
      </section>

      <WaveDivider from="#0c222a" />

      {/* ------------------------------ facts ------------------------------- */}
      <section className="intro-strip" aria-label="At a glance">
        <div className="shell intro-strip__grid">
          <div className="intro-strip__item">
            <span className="intro-strip__value">
              {fromPrice ? `${money(fromPrice)}` : 'Live rates'}
            </span>
            <span className="intro-strip__label">Per person, per night</span>
          </div>
          <div className="intro-strip__item">
            <span className="intro-strip__value">3 min</span>
            <span className="intro-strip__label">To the water on foot</span>
          </div>
          <div className="intro-strip__item">
            <span className="intro-strip__value">30.5064° N</span>
            <span className="intro-strip__label">Between the ocean and the mountains</span>
          </div>
        </div>
      </section>

      {/* --------------------------- 01 awakening --------------------------- */}
      <section className="awakening" id="awakening" aria-labelledby="awakening-title">
        <div className="awakening__media">
          <Media name="waves" alt="Atlantic foam breaking over dark volcanic rock" sizes="100vw" />
        </div>
        <div className="awakening__veil" />
        <div className="awakening__content shell">
          <p className="eyebrow eyebrow--bare">01 — The Atlantic Awakening</p>
          <h2 className="awakening__quote" id="awakening-title" data-split-words>
            The ocean does not ask you to be <em>ready.</em>
          </h2>
          <p className="awakening__note">
            It just keeps arriving — before the village wakes, before the first mint tea.
            Stay close enough and you stop planning your days around the tide chart,
            because the tide chart becomes the plan.
          </p>
        </div>
      </section>

      <WaveDivider from="#102f39" flip />

      {/* ----------------------- 02 ocean & mountains ----------------------- */}
      <ChapterStory />

      {/* --------------------------- 03 ride/connect ------------------------ */}
      <section className="hscroll" ref={hscrollRef} aria-labelledby="rhythm-title">
        <div className="shell hscroll__head">
          <div>
            <p className="eyebrow">03 — Surf & rhythm</p>
            <h2 className="scene__title" id="rhythm-title" style={{ marginTop: '0.8rem' }}>
              Ride. Connect. <em>Repeat.</em>
            </h2>
          </div>
          <p className="micro" style={{ maxWidth: '24ch', textAlign: 'right' }}>
            Mornings in the water. Afternoons slow. Evenings at one table.
          </p>
        </div>
        <div className="hscroll__viewport">
          <div className="hscroll__track" ref={trackRef}>
            {GALLERY.map((item) => (
              <article className="hscroll__item" key={item.title}>
                <TideImage
                  name={item.image}
                  alt={item.alt}
                  sizes="(max-width: 900px) 78vw, 34vw"
                  depth={3}
                />
                <div className="hscroll__caption">
                  <h3>{item.title}</h3>
                  <span>{item.meta}</span>
                </div>
              </article>
            ))}
            <article className="hscroll__item" style={{ display: 'grid', alignContent: 'end' }}>
              <p className="lede" style={{ paddingBottom: '1.4rem' }}>
                Lessons, boards and wetsuits are part of the house. Tell us what you ride and
                we will point you at the right peak.
              </p>
              <Link to="/experiences" className="btn btn--ghost">
                All experiences <span className="arrow">→</span>
              </Link>
            </article>
          </div>
        </div>
        <div className="shell">
          <div className="hscroll__progress" aria-hidden="true">
            <span ref={hscrollBarRef} />
          </div>
        </div>
      </section>

      {/* ---------------------------- 04 rooms ------------------------------ */}
      <section className="scene" aria-labelledby="rooms-title">
        <div className="shell">
          <div className="scene__head">
            <span className="scene__number">04</span>
            <span className="scene__kicker">Sleep</span>
          </div>
          <div style={{ display: 'grid', gap: '1rem', marginBottom: 'clamp(2rem, 4vw, 3rem)' }}>
            <Reveal>
              <h2 className="scene__title" id="rooms-title">
                Your home <em>by the ocean</em>
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="lede">
                Shared dorms and private rooms, all with linen, towels and a place for your
                board. Rates below come straight from the house&apos;s live availability.
              </p>
            </Reveal>
          </div>

          {availability.status === 'loading' ? (
            <div className="rooms-preview" aria-hidden="true">
              {[0, 1, 2].map((key) => (
                <div key={key} className="room-preview">
                  <div className="media skeleton" style={{ aspectRatio: '4 / 5' }} />
                  <div className="skeleton" style={{ height: 20, width: '60%' }} />
                </div>
              ))}
            </div>
          ) : null}

          {availability.status === 'error' ? (
            <div className="empty-state">
              <h3>Live rates are taking a moment</h3>
              <p>
                The booking service is not answering right now. You can still see the rooms
                and try again from the booking page.
              </p>
              <Link to="/accommodation" className="btn btn--ghost">
                View accommodation
              </Link>
            </div>
          ) : null}

          {availability.status === 'ready' && preview.length === 0 ? (
            <div className="empty-state">
              <h3>Every bed is taken for these dates</h3>
              <p>
                That is a good sign for us and a nuisance for you. Try another window in the
                booking page, or write to us and we will find you a bed nearby.
              </p>
              <Link to="/booking" className="btn btn--ghost">
                Check other dates
              </Link>
            </div>
          ) : null}

          {preview.length ? (
            <>
              <div className="rooms-preview">
                {preview.map((room, index) => {
                  const art = roomImages[room.type] || roomImages.dorm;
                  return (
                    <Reveal className="room-preview" key={room.roomId} delay={index * 0.08}>
                      <Link
                        to={`/accommodation/${room.roomId}`}
                        className="room-preview__media"
                        aria-label={`${room.typeLabel}, room ${room.number}`}
                      >
                        <TideImage
                          name={art.image}
                          alt={art.alt}
                          sizes="(max-width: 620px) 100vw, 30vw"
                          depth={3}
                        />
                      </Link>
                      <div className="room-preview__meta">
                        <h3 className="room-preview__name">
                          {room.typeLabel}
                          <span className="micro" style={{ display: 'block' }}>
                            Room {room.number} · sleeps {room.capacity}
                          </span>
                        </h3>
                        <p className="room-preview__price">
                          <strong>{money(room.pricePerBed)}</strong>
                          per night
                        </p>
                      </div>
                      <p className="room-preview__note">
                        {room.bedsAvailable} {room.bedsAvailable === 1 ? 'bed' : 'beds'} free
                        for your dates
                      </p>
                    </Reveal>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginTop: 'clamp(1.5rem, 3vw, 2.5rem)' }}>
                <Link to="/accommodation" className="link-underline">
                  All rooms & availability <span className="arrow">→</span>
                </Link>
                <Link to="/booking" className="link-underline">
                  Book your stay <span className="arrow">→</span>
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {/* --------------------------- 05 community --------------------------- */}
      <section className="scene scene--tight" aria-labelledby="community-title">
        <div className="shell community">
          <div className="community__media">
            <TideImage
              name="dinner"
              alt="Guests sharing a long table with tagine, bread and mint tea"
              sizes="(max-width: 900px) 100vw, 50vw"
              depth={3}
            />
            <div className="community__media--offset">
              <TideImage
                name="lineup"
                alt="Surfers waiting for a set in the Atlantic"
                sizes="25vw"
                depth={3}
              />
            </div>
          </div>
          <div className="community__text">
            <p className="eyebrow">05 — The house</p>
            <Reveal>
              <h2 className="scene__title" id="community-title" data-split-words>
                More than a place <em>to stay</em>
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="lede">
                Most people arrive for the waves and leave talking about the people. There is
                no scene to break into here: the roof is shared, the kettle is communal, and
                dinner happens when enough of us are hungry.
              </p>
            </Reveal>
            <ul className="community__list">
              <li>
                <b>01</b>
                <span>Breakfast on the roof, every morning, included.</span>
              </li>
              <li>
                <b>02</b>
                <span>Surf guiding and lessons with local instructors.</span>
              </li>
              <li>
                <b>03</b>
                <span>Yoga mats, a board store and a place to rinse your wetsuit.</span>
              </li>
              <li>
                <b>04</b>
                <span>Family dinners a few nights a week — vegetarians always welcome.</span>
              </li>
            </ul>
            <Link to="/about" className="link-underline">
              About Stayora <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </section>

      <Marquee phrases={['Salt water mornings', 'Mint tea on the roof', 'Tamraght, Morocco', 'Ride. Connect. Repeat.']} />

      {/* ----------------------------- 06 closing --------------------------- */}
      <section className="cta-band" aria-labelledby="closing-title">
        <div className="cta-band__media">
          <Media
            name="rooftop"
            alt="Rooftop terrace with cushions and lanterns looking over the Atlantic at sunset"
            sizes="100vw"
          />
        </div>
        <div className="cta-band__veil" />
        <div className="cta-band__inner">
          <p className="eyebrow eyebrow--bare" style={{ color: 'var(--sand)' }}>
            06 — Your next chapter
          </p>
          <h2 className="cta-band__title" id="closing-title" data-split-words>
            Your next chapter <em>starts here.</em>
          </h2>
          <p className="lede" style={{ color: 'rgba(246,239,228,0.82)', textAlign: 'center' }}>
            Choose your dates, pick a bed, and we will take it from there. No card needed
            online — we confirm every booking by hand.
          </p>
          <div className="cta-band__actions">
            <Magnetic>
              <Link to="/booking" className="btn btn--light">
                Book your stay
              </Link>
            </Magnetic>
            <Link to="/contact" className="btn btn--onDark">
              Ask us something
            </Link>
          </div>
          <p className="micro" style={{ color: 'rgba(246,239,228,0.6)' }}>
            {site.address} · {site.checkIn} check-in
          </p>
        </div>
      </section>
    </div>
  );
}
