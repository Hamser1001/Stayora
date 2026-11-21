import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from '../lib/useReducedMotion.js';

gsap.registerPlugin(ScrollTrigger);

export default function Reveal({ as: Tag = 'div', children, className = '', delay = 0, y = 26, ...rest }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !ref.current) return undefined;
    const context = gsap.context(() => {
      gsap.fromTo(
        ref.current,
        { autoAlpha: 0, y },
        {
          autoAlpha: 1,
          y: 0,
          duration: 1,
          delay,
          ease: 'power3.out',
          // Without this, content would be hidden until the browser paints —
          // which never happens in a background tab.
          immediateRender: false,
          scrollTrigger: { trigger: ref.current, start: 'top 90%', once: true },
        },
      );
    });
    return () => context.revert();
  }, [reduced, delay, y]);

  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}
