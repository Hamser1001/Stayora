import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Media from './Media.jsx';
import { useReducedMotion } from '../lib/useReducedMotion.js';

gsap.registerPlugin(ScrollTrigger);

/**
 * Photography revealed by the tide: the frame opens from the bottom with a
 * curved edge while the image settles out of a slight swell.
 *
 * The effect is applied only when it can be seen (visible tab, motion allowed),
 * so the image is never left clipped for a background tab or reduced motion.
 */
export default function TideImage({
  name,
  alt,
  className = '',
  sizes = '100vw',
  priority = false,
  depth = 4,
  ratio,
  hoverZoom = true,
  children,
}) {
  const frameRef = useRef(null);
  const layerRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || document.visibilityState === 'hidden' || !frameRef.current) return undefined;

    const context = gsap.context(() => {
      gsap.fromTo(
        frameRef.current,
        { clipPath: 'inset(0% 0% 100% 0% round 0% 0% 42% 42%)' },
        {
          clipPath: 'inset(0% 0% 0% 0% round 0% 0% 0% 0%)',
          duration: 1.35,
          ease: 'power4.inOut',
          immediateRender: false,
          scrollTrigger: { trigger: frameRef.current, start: 'top 88%', once: true },
        },
      );

      gsap.fromTo(
        layerRef.current,
        { yPercent: -depth },
        {
          yPercent: depth,
          ease: 'none',
          scrollTrigger: {
            trigger: frameRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        },
      );
    }, frameRef);

    return () => context.revert();
  }, [reduced, depth]);

  return (
    <div
      ref={frameRef}
      className={`tide${hoverZoom ? ' tide--zoom' : ''} ${className}`}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      <div className="tide__layer" ref={layerRef}>
        <Media name={name} alt={alt} sizes={sizes} priority={priority} />
      </div>
      {children}
    </div>
  );
}
