import { useState } from 'react';
import { Link } from 'react-router-dom';
import Lightbox from '../components/Lightbox.jsx';
import Media from '../components/Media.jsx';
import { useSeo } from '../lib/useSeo.js';
import { galleryItems } from '../content/site.js';

const LAYOUT = ['wide', 'tall', 'third', 'third', 'third', 'half', 'half', 'wide', 'tall', 'third'];

export default function GalleryPage() {
  const [index, setIndex] = useState(null);

  useSeo({
    title: 'Gallery',
    description:
      'Photographs from Stayora and the coast around Tamraght: the lineup, the rooftop, the rooms and the long table.',
    path: '/gallery',
    image: '/images/rooftop.jpg',
  });

  return (
    <>
      <header className="page-hero">
        <div className="shell page-hero__inner">
          <p className="eyebrow">Photographs</p>
          <h1 className="page-hero__title">
            Salt, light <em>& stone.</em>
          </h1>
          <p className="lede">
            What the house and the coast actually look like — early water, hot afternoons,
            and the hour when everyone ends up on the roof.
          </p>
        </div>
      </header>

      <section className="page-section">
        <div className="shell">
          <div className="gallery-grid">
            {galleryItems.map((item, itemIndex) => (
              <figure
                key={`${item.image}-${itemIndex}`}
                className={`gallery-item gallery-item--${LAYOUT[itemIndex] || 'third'}`}
                style={{ margin: 0 }}
              >
                <button
                  type="button"
                  onClick={() => setIndex(itemIndex)}
                  aria-label={`Open image: ${item.caption}`}
                  style={{ display: 'block', width: '100%', height: '100%' }}
                >
                  <Media name={item.image} alt={item.alt} sizes="(max-width: 760px) 100vw, 50vw" />
                </button>
                <figcaption>{item.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section page-section--tight">
        <div className="shell" style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="lede">The best light is the hour before sunset. The best photos are the ones you take yourself.</p>
          <Link to="/booking" className="btn">
            Book your stay
          </Link>
        </div>
      </section>

      {index !== null ? (
        <Lightbox
          items={galleryItems}
          index={index}
          onClose={() => setIndex(null)}
          onNavigate={(next) => setIndex(next)}
        />
      ) : null}
    </>
  );
}
