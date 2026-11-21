import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion.js';

export default function Magnetic({ children, strength = 8 }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced) return undefined;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return undefined;

    let frame = 0;
    const onMove = (event) => {
      const rect = node.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * strength * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * strength;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        node.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      node.style.transform = '';
    };

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
      node.style.transform = '';
    };
  }, [reduced, strength]);

  return (
    <span ref={ref} className="magnetic" style={{ display: 'inline-flex', willChange: 'transform' }}>
      {children}
    </span>
  );
}
