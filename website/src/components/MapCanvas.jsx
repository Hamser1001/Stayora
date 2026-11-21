import { useMemo } from 'react';
import { spots } from '../content/site.js';

const W = 800;
const H = 640;

const BOUNDS = { minLng: -9.752, maxLng: -9.632, minLat: 30.484, maxLat: 30.559 };

function project(lat, lng) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * W;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * H;
  return { x, y };
}

/**
 * Shoreline waypoints, north to south, following the villages and breaks.
 * They come from the property's own coordinates, not from map tiles.
 */
const COAST = [
  [30.559, -9.736],
  [30.552, -9.7305],
  [30.545, -9.7258],
  [30.5455, -9.712],
  [30.5405, -9.7095],
  [30.535, -9.707],
  [30.531, -9.6995],
  [30.527, -9.693],
  [30.5155, -9.6905],
  [30.5061, -9.688],
  [30.5064, -9.653],
  [30.5007, -9.665],
  [30.4926, -9.6426],
];

/** Catmull-Rom → cubic bézier, so the coast reads as a shoreline. */
function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/* Hand-tuned label placement so neighbouring spots never collide. */
const LABELS = {
  'anchor-point': { anchor: 'end', dx: -16, dy: 4 },
  taghazout: { anchor: 'start', dx: 16, dy: -10 },
  panorama: { anchor: 'end', dx: -16, dy: 4 },
  imourane: { anchor: 'start', dx: 16, dy: 2 },
  'devils-rock': { anchor: 'start', dx: 16, dy: -8 },
  tamraght: { anchor: 'start', dx: 16, dy: 26 },
  'banana-beach': { anchor: 'start', dx: 16, dy: 16 },
  aourir: { anchor: 'start', dx: 16, dy: 16 },
};

export default function MapCanvas({ activeId, onActivate }) {
  const { landPath, points } = useMemo(() => {
    const coast = COAST.map(([lat, lng]) => project(lat, lng));
    const line = smoothPath(coast);
    return {
      landPath: `${line} L ${W + 20} ${H + 20} L ${W + 20} -20 Z`,
      points: spots.map((spot) => ({ ...spot, ...project(spot.lat, spot.lng) })),
    };
  }, []);

  return (
    <div className="map-canvas">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label="Stylised map of Tamraght, Aourir and the nearby surf breaks"
      >
        <defs>
          <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#12333e" />
            <stop offset="55%" stopColor="#1b4653" />
            <stop offset="100%" stopColor="#255a67" />
          </linearGradient>
          <linearGradient id="land" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0%" stopColor="#e9d9bf" />
            <stop offset="60%" stopColor="#dfcaab" />
            <stop offset="100%" stopColor="#d3b993" />
          </linearGradient>
          <pattern id="contours" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(14)">
            <path d="M0 17 Q 8.5 8, 17 17 T 34 17" fill="none" stroke="rgba(59,42,32,0.16)" strokeWidth="1" />
          </pattern>
          <pattern id="swell" width="52" height="52" patternUnits="userSpaceOnUse">
            <path d="M0 26 Q 13 15, 26 26 T 52 26" fill="none" stroke="rgba(246,239,228,0.13)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={W} height={H} fill="url(#sea)" />
        <rect width={W} height={H} fill="url(#swell)" />

        <path d={landPath} fill="url(#land)" stroke="#a8532f" strokeWidth="2" strokeOpacity="0.6" />
        <path d={landPath} fill="url(#contours)" />

        {/* The coastal road, just inland of the villages. */}
        <path
          d={`M ${project(30.554, -9.717).x} ${project(30.554, -9.717).y} C ${W * 0.62} ${H * 0.32}, ${W * 0.6} ${H * 0.62}, ${project(30.5, -9.628).x} ${project(30.5, -9.628).y}`}
          fill="none"
          stroke="rgba(59,42,32,0.45)"
          strokeWidth="2"
          strokeDasharray="7 8"
        />

        {points.map((spot) => {
          const active = activeId === spot.id;
          const isHome = spot.id === 'tamraght';
          const isBreak = /break|Point|right/i.test(spot.kind);
          const label = LABELS[spot.id] || { anchor: 'start', dx: 16, dy: 4 };
          return (
            <g
              key={spot.id}
              className="map-spot"
              data-active={active}
              transform={`translate(${spot.x} ${spot.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${spot.name}: ${spot.kind}`}
              aria-pressed={active}
              onClick={() => onActivate?.(spot.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onActivate?.(spot.id);
                }
              }}
            >
              {isHome ? (
                <circle className="map-spot__ring" r="17" fill="rgba(177,84,47,0.18)" stroke="rgba(177,84,47,0.6)" />
              ) : null}
              <circle
                className="map-spot__dot"
                r={isHome ? 6 : isBreak ? 5 : 4}
                fill={isBreak || isHome ? '#b1542f' : '#3b2a20'}
                stroke="#f6efe4"
                strokeWidth="1.5"
              />
              <text
                x={label.dx}
                y={label.dy}
                textAnchor={label.anchor}
                fill={label.anchor === 'start' ? '#3b2a20' : '#f6efe4'}
                stroke={label.anchor === 'start' ? 'rgba(246,239,228,0.7)' : 'rgba(16,47,57,0.55)'}
                strokeWidth="3"
              >
                {spot.name}
              </text>
            </g>
          );
        })}

        <g transform={`translate(${W - 46} ${44})`} aria-hidden="true">
          <path d="M0 -16 L0 16" stroke="rgba(246,239,228,0.45)" strokeWidth="1" />
          <path d="M0 -16 L-4 -8 L4 -8 Z" fill="rgba(246,239,228,0.65)" />
          <text x="8" y="4" fill="rgba(246,239,228,0.6)" fontSize="10" letterSpacing="2">
            N
          </text>
        </g>
      </svg>
      <p className="map-canvas__legend">Approximate positions · not to scale</p>
    </div>
  );
}
