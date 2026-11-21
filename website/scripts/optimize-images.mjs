#!/usr/bin/env node
/**
 * Builds .webp and .avif variants next to each JPEG in public/images.
 * `<Media>` prefers AVIF, then WebP, then the JPEG fallback.
 *
 *   npm run images
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = path.resolve(here, '../public/images');

const files = (await readdir(directory)).filter((file) => file.endsWith('.jpg'));
if (!files.length) {
  console.warn('No JPEG files found in public/images.');
  process.exit(0);
}

for (const file of files) {
  const source = path.join(directory, file);
  const base = source.replace(/\.jpg$/, '');
  const image = sharp(source);

  await Promise.all([
    image.clone().webp({ quality: 80, effort: 4 }).toFile(`${base}.webp`),
    image.clone().avif({ quality: 52, effort: 4 }).toFile(`${base}.avif`),
  ]);

  const [jpeg, webp, avif] = await Promise.all([
    stat(source),
    stat(`${base}.webp`),
    stat(`${base}.avif`),
  ]);
  console.log(
    `${file.padEnd(24)} jpg ${Math.round(jpeg.size / 1024)}kB · webp ${Math.round(
      webp.size / 1024,
    )}kB · avif ${Math.round(avif.size / 1024)}kB`,
  );
}
