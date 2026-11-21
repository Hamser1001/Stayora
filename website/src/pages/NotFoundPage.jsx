import { Link } from 'react-router-dom';
import { useSeo } from '../lib/useSeo.js';

export default function NotFoundPage() {
  useSeo({
    title: 'Page not found',
    description: 'That page has drifted out with the tide.',
    path: '/404',
  });

  return (
    <section className="notfound">
      <div className="shell notfound__inner">
        <p className="eyebrow">404</p>
        <h1 className="display">Lost the current.</h1>
        <p className="lede" style={{ textAlign: 'center' }}>
          That page is not here — maybe it moved, maybe it was never a wave worth surfing. The
          house is still where you left it.
        </p>
        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/" className="btn">
            Back to the homepage
          </Link>
          <Link to="/booking" className="btn btn--ghost">
            Book a stay
          </Link>
        </div>
      </div>
    </section>
  );
}
