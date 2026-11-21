import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useReducedMotion } from '../lib/useReducedMotion.js';

/**
 * A very quiet pointer companion for mouse users: a terracotta dot with a ring
 * that lags a little and opens up over links. The native cursor stays visible,
 * so nothing about pointing or clicking changes.
 */
export default function CustomCursor() {
  const rootRef = useRef(null);
  const ringRef = useRef(null);
  const dotRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return undefined;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;

    const ring = ringRef.current;
    const dot = dotRef.current;
    const root = rootRef.current;
    if (!ring || !dot || !root) return undefined;

    gsap.set([ring, dot], { xPercent: -50, yPercent: -50 });
    const ringX = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' });
    const ringY = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
    const dotX = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power2' });
    const dotY = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power2' });

    let visible = false;
    const show = () => {
      if (visible) return;
      visible = true;
      gsap.to(root, { autoAlpha: 1, duration: 0.25, overwrite: true });
    };

    const onMove = (event) => {
      show();
      ringX(event.clientX);
      ringY(event.clientY);
      dotX(event.clientX);
      dotY(event.clientY);
    };

    const onOver = (event) => {
      const target = event.target instanceof Element ? event.target.closest('a, button, [data-cursor]') : null;
      gsap.to(ring, {
        scale: target ? 1.9 : 1,
        opacity: target ? 0.5 : 1,
        duration: 0.35,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    };

    const onLeave = () => {
      visible = false;
      gsap.to(root, { autoAlpha: 0, duration: 0.2, overwrite: true });
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerleave', onLeave);
      gsap.killTweensOf([ring, dot, root]);
    };
  }, [reduced]);

  return (
    <div className="cursor" ref={rootRef} aria-hidden="true">
      <span className="cursor__ring" ref={ringRef} />
      <span className="cursor__dot" ref={dotRef} />
    </div>
  );
}
