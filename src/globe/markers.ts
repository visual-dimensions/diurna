import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { City } from '../data/load';

export const MARKER_SOURCE = 'cities';
export const HIT_LAYERS = ['city-hit', 'city-hit-minor'];

interface CityProps {
  key: string;
  level: number;
  count: number;
  minor: boolean;
}

export function citiesToGeoJSON(cities: City[]): FeatureCollection<Point, CityProps> {
  return {
    type: 'FeatureCollection',
    features: cities.map((c) => ({
      type: 'Feature',
      properties: { key: c.key, level: c.level, count: c.media.length, minor: c.minor },
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

/** Cities with only regional (tier 3) media fade in between these zoom levels. */
const MINOR_FROM = 2.6;
const MINOR_FULL = 3.2;
const fade = (expr: unknown): ExpressionSpecification =>
  ['interpolate', ['linear'], ['zoom'], MINOR_FROM, ['*', expr, ['case', ['get', 'minor'], 0, 1]], MINOR_FULL, expr] as unknown as ExpressionSpecification;

/** Multiply by feature-state "on" (0..1, default 1) – used by the intro to switch the lights on. */
const lit = (expr: unknown): ExpressionSpecification =>
  ['*', expr, ['coalesce', ['feature-state', 'on'], 1]] as unknown as ExpressionSpecification;

export function addMarkerLayers(map: MapLibreMap, data: FeatureCollection<Point, CityProps>) {
  map.addSource(MARKER_SOURCE, { type: 'geojson', data, promoteId: 'key' });

  // Soft halo – the "light" of the newsroom.
  map.addLayer({
    id: 'city-glow',
    type: 'circle',
    source: MARKER_SOURCE,
    filter: ['>', level, 0],
    paint: {
      'circle-color': byLevel('#ffb347', '#e3a55a', '#8a6a42', '#000'),
      'circle-radius': zoomed(['+', byLevel(16, 11, 7, 0), ['*', ['min', ['get', 'count'], 6], 1.5]] as ExpressionSpecification),
      'circle-opacity': fade(lit(byLevel(0.42, 0.24, 0.14, 0))),
      'circle-blur': 1,
      'circle-pitch-alignment': 'map',
    },
  });

  // Pulse ring, driven by feature-state "pulse" (0..1).
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
      'circle-opacity': fade(lit(1)),
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
      'circle-stroke-opacity': fade(lit(0.8)),
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
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 3.4, 0, 3.7, lit(1)],
    },
  });

  // Invisible 44×44 px hit areas; regional-only cities become tappable once they are visible.
  map.addLayer({
    id: HIT_LAYERS[0],
    type: 'circle',
    source: MARKER_SOURCE,
    filter: ['!', ['get', 'minor']],
    paint: { 'circle-radius': 22, 'circle-opacity': 0 },
  });
  map.addLayer({
    id: HIT_LAYERS[1],
    type: 'circle',
    source: MARKER_SOURCE,
    minzoom: MINOR_FULL - 0.2,
    filter: ['get', 'minor'],
    paint: { 'circle-radius': 22, 'circle-opacity': 0 },
  });
}

export function updateMarkers(map: MapLibreMap, cities: City[]) {
  (map.getSource(MARKER_SOURCE) as GeoJSONSource | undefined)?.setData(citiesToGeoJSON(cities));
}

const easeOut = (p: number) => 1 - (1 - p) ** 3;

/** Run `step(progress 0..1)` per city, staggered east → west like a sunrise. Returns a cancel function. */
function sunrise(cities: City[], duration: number, stagger: number, step: (c: City, p: number) => void, done?: () => void): () => void {
  let cancelled = false;
  if (!cities.length) {
    done?.();
    return () => {};
  }
  const lons = cities.map((c) => c.lon);
  const east = Math.max(...lons);
  const span = Math.max(1, east - Math.min(...lons));
  const start = performance.now();
  const frame = (t: number) => {
    if (cancelled) return;
    let running = false;
    for (const c of cities) {
      const local = (t - start - ((east - c.lon) / span) * stagger) / duration;
      if (local < 1) running = true;
      if (local >= 0) step(c, Math.min(1, local));
    }
    if (running) requestAnimationFrame(frame);
    else done?.();
  };
  requestAnimationFrame(frame);
  return () => (cancelled = true);
}

/** A pulse ring on each given city with a fresh headline. No-op with reduced motion. */
export function pulse(map: MapLibreMap, cities: City[], reducedMotion: boolean, stagger = 0) {
  if (reducedMotion) return;
  sunrise(cities.filter((c) => c.level === 3), 1600, stagger, (c, p) =>
    map.setFeatureState({ source: MARKER_SOURCE, id: c.key }, { pulse: easeOut(p) }),
  );
}

/** Switch all lights off (for the intro). */
export function lightsOff(map: MapLibreMap, cities: City[]) {
  for (const c of cities) map.setFeatureState({ source: MARKER_SOURCE, id: c.key }, { on: 0 });
}

/** Switch the lights on east → west; fresh cities pulse as they light up. Returns a cancel function. */
export function lightsOn(map: MapLibreMap, cities: City[], stagger: number, onDone?: () => void) {
  return sunrise(
    cities,
    1400,
    stagger,
    (c, p) =>
      map.setFeatureState(
        { source: MARKER_SOURCE, id: c.key },
        { on: easeOut(Math.min(1, p * 3)), ...(c.level === 3 ? { pulse: easeOut(p) } : {}) },
      ),
    onDone,
  );
}

/** Immediately switch every light on (skipped intro). */
export function lightsOnNow(map: MapLibreMap, cities: City[]) {
  for (const c of cities) map.setFeatureState({ source: MARKER_SOURCE, id: c.key }, { on: 1, pulse: 1 });
}
