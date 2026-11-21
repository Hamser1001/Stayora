import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from '../lib/useReducedMotion.js';

gsap.registerPlugin(ScrollTrigger);

/**
 * A shoreline between two sections: two wave layers that drift in opposite
 * directions with the scroll, like water pulling at the sand.
 *
 * `from` is the colour of the section above (the wave); the band itself takes
 * the colour of the section below.
 */
export default function WaveDivider({ from = 'var(--ocean-deep)', flip = false, tone = 'cream' }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced || document.visibilityState === 'hidden') return undefined;

    const context = gsap.context(() => {
      gsap.fromTo(
        '.wave-divider__back',
        { xPercent: -2 },
        {
          xPercent: 2,
          ease: 'none',
          scrollTrigger: { trigger: node, start: 'top bottom', end: 'bottom top', scrub: true },
        },
      );
      gsap.fromTo(
        '.wave-divider__front',
        { xPercent: 2 },
        {
          xPercent: -2,
          ease: 'none',
          scrollTrigger: { trigger: node, start: 'top bottom', end: 'bottom top', scrub: true },
        },
      );
    }, node);

    return () => context.revert();
  }, [reduced]);

  return (
    <div
      ref={ref}
      className={`wave-divider${flip ? ' wave-divider--flip' : ''} wave-divider--${tone}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 1440 140" preserveAspectRatio="none" focusable="false">
        <path
          className="wave-divider__back"
          style={{ fill: from }}
          d="M0,58 C210,18 430,104 720,66 C1010,28 1230,96 1440,50 L1440,140 L0,140 Z"
        />
        <path
          className="wave-divider__front"
          style={{ fill: from }}
          d="M0,86 C230,44 470,120 730,92 C980,66 1220,110 1440,76 L1440,140 L0,140 Z"
        />
      </svg>
    </div>
  );
}
