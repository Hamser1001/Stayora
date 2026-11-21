import { useEffect, useRef } from 'react';

export default function Lightbox({ items, index, onClose, onNavigate }) {
  const closeRef = useRef(null);
  const item = items[index];

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onNavigate((index + 1) % items.length);
      if (event.key === 'ArrowLeft') onNavigate((index - 1 + items.length) % items.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onClose, onNavigate]);

  if (!item) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Gallery image">
      <div className="lightbox__bar">
        <span>
          {String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
        </span>
        <button type="button" className="icon-btn" onClick={onClose} ref={closeRef} aria-label="Close gallery">
          ✕
        </button>
      </div>
      <figure className="lightbox__figure">
        <img src={`/images/${item.image}.jpg`} alt={item.alt} />
      </figure>
      <div className="lightbox__controls">
        <button
          type="button"
          className="icon-btn"
          onClick={() => onNavigate((index - 1 + items.length) % items.length)}
          aria-label="Previous image"
        >
          ←
        </button>
        <p style={{ margin: 0, fontSize: '0.72rem', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          {item.caption}
        </p>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onNavigate((index + 1) % items.length)}
          aria-label="Next image"
        >
          →
        </button>
      </div>
    </div>
  );
}
