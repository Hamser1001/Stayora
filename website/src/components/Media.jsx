const DIMENSIONS = {
  'hero-atlantic': [1392, 752],
  rooftop: [1392, 752],
  'tamraght-hillside': [1248, 832],
  lineup: [1248, 832],
  'surf-lesson': [1248, 832],
  dinner: [1248, 832],
  waves: [1248, 832],
  dorm: [1184, 880],
  'private-room': [1184, 880],
  details: [880, 1184],
};

/**
 * Photography with modern formats. The AVIF and WebP variants are produced by
 * `npm run images`; the JPEG stays as the universal fallback.
 */
export default function Media({ name, alt, className = '', priority = false, sizes = '100vw' }) {
  const [width, height] = DIMENSIONS[name] || [1200, 800];
  const base = `/images/${name}`;

  return (
    <picture className={className}>
      <source type="image/avif" srcSet={`${base}.avif`} sizes={sizes} />
      <source type="image/webp" srcSet={`${base}.webp`} sizes={sizes} />
      <img
        src={`${base}.jpg`}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        fetchpriority={priority ? 'high' : 'auto'}
        decoding={priority ? 'sync' : 'async'}
      />
    </picture>
  );
}
