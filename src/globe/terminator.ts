import type { FeatureCollection, MultiPolygon } from 'geojson';

const RAD = Math.PI / 180;

/** Subsolar point (lat/lon in degrees), low-precision solar ephemeris (~0.1°). */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)) / RAD;
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const lon = ((((ra - gmst * 15 + 180) % 360) + 360) % 360) - 180;
  return { lat: dec, lon };
}

/**
 * MapLibre light position [radial, azimuthal°, polar°] (anchor "map") for the
 * real sun. Empirically, in that frame the polar angle is measured from the
 * direction of (0°N, 180°E) and the azimuth from south towards east, so for a
 * subsolar point with unit vector x = cosφ·cosλ, y = cosφ·sinλ, z = sinφ:
 * polar = acos(−x), azimuth = atan2(y, −z).
 */
export function sunLightPosition(date: Date): [number, number, number] {
  const { lat, lon } = subsolarPoint(date);
  const x = Math.cos(lat * RAD) * Math.cos(lon * RAD);
  const y = Math.cos(lat * RAD) * Math.sin(lon * RAD);
  const z = Math.sin(lat * RAD);
  return [1.5, Math.atan2(y, -z) / RAD, Math.acos(-x) / RAD];
}

/**
 * Latitude interval (radians) of all points on meridian `lon` whose angular
 * distance to (lat0, lon0) is at most `radius`, or null.
 */
function interval(lon: number, lat0: number, lon0: number, radius: number): [number, number] | null {
  const A = Math.sin(lat0);
  const B = Math.cos(lat0) * Math.cos(lon - lon0);
  const R = Math.hypot(A, B);
  const c = Math.cos(radius);
  if (R < 1e-9 || c / R > 1) return null;
  const alpha = Math.atan2(B, A);
  const s = Math.asin(Math.max(-1, c / R));
  // sin(lat + alpha) >= c/R  <=>  lat + alpha in [s, PI - s] (mod 2PI)
  for (const k of [-2, 0, 2]) {
    const lo = Math.max(-Math.PI / 2, s - alpha + k * Math.PI);
    const hi = Math.min(Math.PI / 2, Math.PI - s - alpha + k * Math.PI);
    if (hi > lo) return [lo, hi];
  }
  return null;
}

/**
 * Night bands around the antisolar point: each band is the region where the
 * sun is below `altitude` degrees. Stacking translucent bands gives a soft
 * terminator. Sampled per meridian (1°), which sidesteps the pole and
 * antimeridian problems of a ring around the antisolar point.
 */
export function nightBands(date: Date, altitudes: number[]): FeatureCollection<MultiPolygon, { altitude: number }> {
  const sun = subsolarPoint(date);
  const lat0 = -sun.lat * RAD;
  const lon0 = (sun.lon + 180) * RAD;
  const deg = (v: number) => v / RAD;

  return {
    type: 'FeatureCollection',
    features: altitudes.map((altitude) => {
      const radius = (90 + altitude) * RAD;
      // One polygon per contiguous run of meridians: lower edge west→east, upper edge back.
      const polygons: number[][][][] = [];
      let lower: number[][] = [];
      let upper: number[][] = [];
      const flush = () => {
        if (lower.length > 1) polygons.push([[...lower, ...upper.reverse(), lower[0]]]);
        lower = [];
        upper = [];
      };
      for (let lon = -180; lon <= 180; lon += 1) {
        const iv = interval(lon * RAD, lat0, lon0, radius);
        if (!iv) {
          flush();
          continue;
        }
        lower.push([lon, deg(iv[0])]);
        upper.push([lon, deg(iv[1])]);
      }
      flush();
      return { type: 'Feature', properties: { altitude }, geometry: { type: 'MultiPolygon', coordinates: polygons } };
    }),
  };
}
