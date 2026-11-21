import { useEffect } from 'react';
import { SITE_ORIGIN } from './api.js';

function upsertMeta(selector, attrs) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement('meta');
    document.head.appendChild(node);
  }
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function upsertLink(rel, href) {
  let node = document.head.querySelector(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', rel);
    document.head.appendChild(node);
  }
  node.setAttribute('href', href);
}

export function useSeo({ title, description, path = '/', image = '/images/hero-atlantic.jpg', jsonLd }) {
  useEffect(() => {
    const fullTitle = title ? `${title} — Stayora` : 'Stayora — Surf & Stay in Tamraght, Morocco';
    const url = `${SITE_ORIGIN}${path}`;
    const absoluteImage = image.startsWith('http') ? image : `${SITE_ORIGIN}${image}`;

    document.title = fullTitle;
    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: absoluteImage });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: fullTitle });
    upsertMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: description,
    });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: absoluteImage });
    upsertLink('canonical', url);

    let script = document.getElementById('page-structured-data');
    if (jsonLd) {
      if (!script) {
        script = document.createElement('script');
        script.id = 'page-structured-data';
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else if (script) {
      script.remove();
    }
  }, [title, description, path, image, jsonLd]);
}
