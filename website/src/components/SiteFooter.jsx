import { Link } from 'react-router-dom';
import { site } from '../content/site.js';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="site-footer__top">
          <div>
            <p className="eyebrow">Tamraght, Morocco</p>
            <p className="site-footer__title">
              Find your wave. <em>Stay a while.</em>
            </p>
          </div>
          <div className="site-footer__col">
            <h3>Stay</h3>
            <Link to="/accommodation">Accommodation</Link>
            <Link to="/booking">Book your stay</Link>
            <Link to="/experiences">Experiences</Link>
            <Link to="/gallery">Gallery</Link>
          </div>
          <div className="site-footer__col">
            <h3>Find us</h3>
            <p>{site.address}</p>
            <a href={`mailto:${site.email}`}>{site.email}</a>
            <a href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a>
            <a href={site.mapsUrl} target="_blank" rel="noreferrer">
              {site.coordinates.lat}° N, {Math.abs(site.coordinates.lng)}° W
            </a>
          </div>
        </div>
        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} Stayora · Tamraght, Aourir</span>
          <span className="site-footer__credit">
            Designed &amp; Developed by <b>Hamza Serhani</b>
          </span>
          <span>Made on the Atlantic coast</span>
        </div>
      </div>
    </footer>
  );
}
