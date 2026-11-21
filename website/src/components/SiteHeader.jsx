import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { site } from '../content/site.js';

const LINKS = [
  { to: '/accommodation', label: 'Stay' },
  { to: '/experiences', label: 'Experiences' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/location', label: 'Location' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export default function SiteHeader() {
  const location = useLocation();
  const overlay = location.pathname === '/';
  const [solid, setSolid] = useState(!overlay);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const panelRef = useRef(null);
  const toggleRef = useRef(null);

  // Any navigation closes the drawer, including tapping the current page.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let last = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      setSolid(!overlay || y > 32);
      if (!open && !document.body.classList.contains('nav-open')) {
        if (y > 240 && y > last + 6) setHidden(true);
        else if (y < last - 6 || y < 120) setHidden(false);
      }
      last = y;
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [overlay, open]);

  useEffect(() => {
    document.body.classList.toggle('nav-open', open);
    if (open) {
      setHidden(false);
      const firstLink = panelRef.current?.querySelector('a');
      firstLink?.focus({ preventScroll: true });
    }
    return () => document.body.classList.remove('nav-open');
  }, [open]);

  const closeMenu = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) {
      requestAnimationFrame(() => toggleRef.current?.focus({ preventScroll: true }));
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key !== 'Tab') return;

      // Keep keyboard focus inside the open drawer and its toggle.
      const panel = panelRef.current;
      const focusables = [
        ...(panel ? panel.querySelectorAll('a, button') : []),
        toggleRef.current,
      ].filter(Boolean);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeMenu]);

  return (
    <>
      <header
        className="site-header"
        data-solid={solid || open}
        data-hidden={hidden}
        data-menu={open ? 'open' : 'closed'}
      >
        <div className="site-header__inner shell">
          <Link to="/" className="brand" aria-label="Stayora — home">
            <svg className="brand__mark" viewBox="0 0 64 40" aria-hidden="true">
              <path
                d="M4 15c7-8 13-8 20 0s13 8 20 0 10-6 16-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M4 29c7-8 13-8 20 0s13 8 20 0"
                fill="none"
                stroke="#b1542f"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
            <span className="brand__word">Stayora</span>
          </Link>

          <nav className="nav" aria-label="Primary">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className="nav__link">
                <span className="nav__label">{link.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="site-header__actions">
            <Link to="/booking" className="btn btn--book">
              Book your stay
            </Link>

            <button
              ref={toggleRef}
              type="button"
              className="menu-toggle"
              aria-expanded={open}
              aria-controls="mobile-navigation"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => (open ? closeMenu() : setOpen(true))}
            >
              <span className="menu-toggle__bars" aria-hidden="true">
                <span />
                <span />
              </span>
              <span className="menu-toggle__label">{open ? 'Close' : 'Menu'}</span>
            </button>
          </div>
        </div>
      </header>

      <div
        id="mobile-navigation"
        className="mobile-nav"
        data-open={open}
        ref={panelRef}
        role="dialog"
        aria-modal={open ? 'true' : undefined}
        aria-label="Site menu"
        aria-hidden={!open}
        inert={open ? undefined : ''}
      >
        <nav className="mobile-nav__links" aria-label="Mobile">
          {LINKS.map((link, index) => (
            <Link
              key={link.to}
              to={link.to}
              className="mobile-nav__link"
              style={{ '--i': index }}
              tabIndex={open ? 0 : -1}
              onClick={() => setOpen(false)}
            >
              {link.label}
              <span>{String(index + 1).padStart(2, '0')}</span>
            </Link>
          ))}
          <Link
            to="/booking"
            className="mobile-nav__link mobile-nav__link--book"
            style={{ '--i': LINKS.length }}
            tabIndex={open ? 0 : -1}
            onClick={() => setOpen(false)}
          >
            Book
            <span>{String(LINKS.length + 1).padStart(2, '0')}</span>
          </Link>
        </nav>

        <div className="mobile-nav__footer">
          <p>{site.address}</p>
          <a href={`mailto:${site.email}`} tabIndex={open ? 0 : -1}>
            {site.email}
          </a>
          <a href={`tel:${site.phone.replace(/\s/g, '')}`} tabIndex={open ? 0 : -1}>
            {site.phone}
          </a>
        </div>

        <p className="mobile-nav__signature" aria-hidden="true">
          Tamraght · 30.5064° N, 9.653° W
        </p>
      </div>
    </>
  );
}
