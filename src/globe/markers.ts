import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { City } from '../data/load';

export const MARKER_SOURCE = 'cities';
export const HIT_LAYER = 'city-hit';

interface CityProps {
  key: string;
  level: number;
  count: number;
}

export function citiesToGeoJSON(cities: City[]): FeatureCollection<Point, CityProps> {
  return {
    type: 'FeatureCollection',
    features: cities.map((c, i) => ({
      type: 'Feature',
      id: i,
      properties: { key: c.key, level: c.level, count: c.media.length },
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    })),
  };
}

const level: ExpressionSpecification = ['get', 'level'];
const byLevel = (fresh: unknown, mid: unknown, dim: unknown, none: unknown) =>
  ['match', level, 3, fresh, 2, mid, 1, dim, none] as unknown as ExpressionSpecification;

/** Scale a data expression with zoom (zoom must be the outermost interpolation). */
const zoomed = (expr: ExpressionSpecification, near = 1.6): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], 1.5, ['*', expr, 0.75], 3, expr, 7, ['*', expr, near]];

const cluster = ['>', ['get', 'count'], 1] as unknown as ExpressionSpecification;
/** Core radius of a point; multi-media cities get a little more light. */
const single = ['+', byLevel(3.0, 2.6, 2.2, 0), ['*', 0.35, ['min', ['-', ['get', 'count'], 1], 4]]] as unknown as ExpressionSpecification;

export function addMarkerLayers(map: MapLibreMap, data: FeatureCollection<Point, CityProps>) {
  map.addSource(MARKER_SOURCE, { type: 'geojson', data });

  // Soft halo – the "light" of the newsroom.
  map.addLayer({
    id: 'city-glow',
    type: 'circle',
    source: MARKER_SOURCE,
    filter: ['>', level, 0],
    paint: {
      'circle-color': byLevel('#ffb347', '#e3a55a', '#8a6a42', '#000'),
      'circle-radius': zoomed(['+', byLevel(16, 11, 7, 0), ['*', ['min', ['get', 'count'], 6], 1.5]] as ExpressionSpecification),
      'circle-opacity': byLevel(0.42, 0.24, 0.14, 0),
      'circle-blur': 1,
      'circle-pitch-alignment': 'map',
    },
  });

  // One-time pulse ring, driven by feature-state "pulse" (0..1).
  map.addLayer({
    id: 'city-pulse',
    type: 'circle',
    source: MARKER_SOURCE,
    filter: ['==', level, 3],
    paint: {
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#ffcf8a',
      'circle-stroke-width': 1.2,
      'circle-radius': ['+', 4, ['*', 26, ['coalesce', ['feature-state', 'pulse'], 0]]],
      'circle-stroke-opacity': ['*', 0.8, ['-', 1, ['coalesce', ['feature-state', 'pulse'], 1]]],
    },
  });

  // Bright core.
  map.addLayer({
    id: 'city-core',
    type: 'circle',
    source: MARKER_SOURCE,
    filter: ['>', level, 0],
    paint: {
      'circle-color': byLevel('#fff3dc', '#f1d3a0', '#a08866', '#000'),
      // World view: plain points, slightly larger for multi-media cities. From zoom 3.4: discs with a number.
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        1.5, ['*', 0.8, single],
        3.2, ['*', 1.05, single],
        3.6, ['case', cluster, byLevel(7.5, 7, 6.5, 0), single],
        7, ['case', cluster, byLevel(9.5, 9, 8.5, 0), ['*', 1.5, single]],
      ],
      'circle-blur': ['interpolate', ['linear'], ['zoom'], 3.2, 0.35, 3.6, ['case', cluster, 0.12, 0.35]],
    },
  });

  // No current headline: small hollow grey ring.
  map.addLayer({
    id: 'city-empty',
    type: 'circle',
    source: MARKER_SOURCE,
    filter: ['==', level, 0],
    paint: {
      'circle-color': 'rgba(0,0,0,0)',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1.5, 2, 3.4, 2.6, 3.6, ['case', cluster, 6, 2.6], 7, ['case', cluster, 8, 3.5]],
      'circle-stroke-color': '#7b8496',
      'circle-stroke-width': 1,
      'circle-stroke-opacity': 0.8,
    },
  });

  // Count inside clusters.
  map.addLayer({
    id: 'city-count',
    type: 'symbol',
    source: MARKER_SOURCE,
    minzoom: 3.4,
    filter: cluster,
    layout: {
      'text-field': ['to-string', ['get', 'count']],
      'text-font': ['Open Sans Semibold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 3.4, 9.5, 7, 12],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': byLevel('#3a2408', '#3a2a12', '#1c1608', '#9aa2b2'),
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 3.4, 0, 3.7, 1],
    },
  });

  // Invisible 44×44 px hit area.
  map.addLayer({
    id: HIT_LAYER,
    type: 'circle',
    source: MARKER_SOURCE,
    paint: { 'circle-radius': 22, 'circle-opacity': 0 },
  });
}

/**
 * One pulse per fresh city, staggered east → west like a sunrise.
 * Skipped entirely with prefers-reduced-motion.
 */
export function pulseFresh(map: MapLibreMap, cities: City[], reducedMotion: boolean) {
  if (reducedMotion) return;
  const fresh = cities.map((c, i) => ({ c, i })).filter(({ c }) => c.level === 3);
  if (!fresh.length) return;
  const lons = fresh.map(({ c }) => c.lon);
  const east = Math.max(...lons);
  const span = Math.max(1, east - Math.min(...lons));
  const DURATION = 1600;
  const STAGGER = 1400;
  const start = performance.now();

  const frame = (t: number) => {
    let running = false;
    for (const { c, i } of fresh) {
      const local = (t - start - ((east - c.lon) / span) * STAGGER) / DURATION;
      const p = Math.min(1, Math.max(0, local));
      if (local < 1) running = true;
      if (local >= 0) map.setFeatureState({ source: MARKER_SOURCE, id: i }, { pulse: 1 - (1 - p) ** 3 });
    }
    if (running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function updateMarkers(map: MapLibreMap, data: FeatureCollection<Point, CityProps>) {
  (map.getSource(MARKER_SOURCE) as GeoJSONSource | undefined)?.setData(data);
}
