import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import SiteHeader from './SiteHeader.jsx';
import SiteFooter from './SiteFooter.jsx';
import CustomCursor from './CustomCursor.jsx';
import { useReducedMotion } from '../lib/useReducedMotion.js';

gsap.registerPlugin(ScrollTrigger);

export default function Layout() {
  const location = useLocation();
  const contentRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    // A short tide-like hand-off between pages. Skipped for reduced motion and
    // background tabs, where the new page should simply be there.
    if (!reduced && document.visibilityState !== 'hidden' && contentRef.current) {
      gsap.fromTo(
        contentRef.current,
        { autoAlpha: 0, y: 16 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.55,
          ease: 'power2.out',
          clearProps: 'opacity,visibility,transform',
        },
      );
    }

    const frame = requestAnimationFrame(() => ScrollTrigger.refresh());
    const settle = setTimeout(() => ScrollTrigger.refresh(), 420);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [location.pathname, reduced]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <div className="page-shell" ref={contentRef}>
        <main id="main">
          <Outlet />
        </main>
        <SiteFooter />
      </div>
      <CustomCursor />
      <div className="grain" aria-hidden="true" />
    </>
  );
}
