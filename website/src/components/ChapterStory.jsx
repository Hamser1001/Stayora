import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Media from './Media.jsx';
import { splitWords } from '../lib/splitWords.js';
import { useReducedMotion } from '../lib/useReducedMotion.js';

gsap.registerPlugin(ScrollTrigger);

const CHAPTERS = [
  {
    id: 'tamraght',
    kicker: 'The house',
    title: 'Tamraght',
    text: 'A dry hillside of whitewashed houses, fishing boats below and the Atlantic in front of every window. Our street has a bakery, two surf shops and a road that ends at the water.',
    image: 'tamraght-hillside',
    alt: 'Tamraght village houses stacked on a dry hillside above the sea',
  },
  {
    id: 'aourir',
    kicker: 'Five minutes south',
    title: 'Aourir',
    text: 'Banana Village: the Sunday market, argan co-operatives and the road that climbs inland to Paradise Valley. This is where the house buys its bread, its olives and its palm baskets.',
    image: 'details',
    alt: 'Zellige tiles, pottery and woven textiles in warm light',
  },
  {
    id: 'taghazout',
    kicker: 'Fifteen minutes north',
    title: 'Taghazout',
    text: 'A surf village that has kept its own rhythm. Hash Point peels in front of the cafés, the skate park hums in the afternoon, and Anchor Point waits north of the bay for the serious days.',
    image: 'lineup',
    alt: 'Surfers waiting for a set in the Atlantic off Taghazout',
  },
];

/**
 * A pinned, scroll-scrubbed story: the section holds still while the coast
 * moves from Tamraght to Aourir to Taghazout — copy rising, photographs
 * settling like a swell. Tablets and phones get the same story as a calm,
 * fully readable stack.
 */
export default function ChapterStory() {
  const sectionRef = useRef(null);
  const barRef = useRef(null);
  const counterRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;

    // A hidden tab cannot animate; show the whole story rather than a frozen
    // first chapter.
    if (document.visibilityState === 'hidden') {
      section.classList.add('chapters--static');
      return undefined;
    }
    if (reduced) return undefined;

    const media = gsap.matchMedia();

    media.add('(min-width: 1025px)', () => {
      const panels = gsap.utils.toArray('.chap', section);
      const frames = gsap.utils.toArray('.chap__frame', section);
      const titleWords = splitWords(section.querySelector('.chapters__title'));
      const bar = barRef.current;
      const counter = counterRef.current;

      if (bar) gsap.set(bar, { scaleX: 0, transformOrigin: 'left center' });

      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=230%',
          pin: true,
          scrub: 0.7,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const index = Math.min(
              CHAPTERS.length - 1,
              Math.floor(self.progress * CHAPTERS.length),
            );
            if (counter && counter.dataset.index !== String(index)) {
              counter.dataset.index = String(index);
              counter.textContent = `0${index + 1}`;
            }
          },
        },
      });

      if (titleWords.length) {
        tl.from(titleWords, { yPercent: 120, stagger: 0.03, duration: 0.5 }, 0);
      }

      panels.slice(1).forEach((panel, offset) => {
        const step = offset + 1;
        tl.to(panels[step - 1], { autoAlpha: 0, y: -26, duration: 0.32 }, step - 0.34)
          .fromTo(
            panel,
            { autoAlpha: 0, y: 34 },
            { autoAlpha: 1, y: 0, duration: 0.42 },
            step - 0.3,
          );
        tl.to(frames[step - 1], { autoAlpha: 0, scale: 0.94, duration: 0.4 }, step - 0.34)
          .fromTo(
            frames[step],
            { autoAlpha: 0, scale: 1.16 },
            { autoAlpha: 1, scale: 1, duration: 0.55, ease: 'power2.out' },
            step - 0.3,
          );
      });

      if (bar) tl.to(bar, { scaleX: 1, ease: 'none', duration: CHAPTERS.length - 1 }, 0);

      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
      };
    });

    return () => media.revert();
  }, [reduced]);

  return (
    <section className="chapters" ref={sectionRef} aria-labelledby="landscape-title">
      <div className="chapters__viewport">
        <div className="shell">
          <div className="chapters__head">
            <span className="scene__number">02</span>
            <span className="scene__kicker">The place</span>
          </div>

          <div className="chapters__grid">
            <div className="chapters__copy">
              <h2 className="chapters__title" id="landscape-title">
                Between ocean <em>&amp;</em> mountains
              </h2>

              <div className="chapters__panels">
                {CHAPTERS.map((chapter, index) => (
                  <article className="chap" key={chapter.id} data-chapter={chapter.id}>
                    <p className="chap__meta">
                      <span>0{index + 1}</span> — {chapter.kicker}
                    </p>
                    <h3 className="chap__title">{chapter.title}</h3>
                    <p className="chap__text">{chapter.text}</p>
                  </article>
                ))}
              </div>

              <div className="chapters__controls">
                <div className="chapters__progress" aria-hidden="true">
                  <span ref={barRef} />
                </div>
                <p className="chapters__counter" aria-hidden="true">
                  <span ref={counterRef}>01</span> / 0{CHAPTERS.length}
                </p>
              </div>

              <Link to="/location" className="link-underline">
                See the map <span className="arrow">→</span>
              </Link>
            </div>

            <div className="chapters__frames">
              {CHAPTERS.map((chapter) => (
                <div className="chap__frame" key={chapter.id}>
                  <Media
                    name={chapter.image}
                    alt={chapter.alt}
                    sizes="(max-width: 1024px) 100vw, 46vw"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
