import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import land110Url from '../../assets/geo/land-110m.geojson?url';
import borders110Url from '../../assets/geo/borders-110m.geojson?url';
import land50Url from '../../assets/geo/land-50m.geojson?url';
import borders50Url from '../../assets/geo/borders-50m.geojson?url';

/** Colours of the globe itself; UI colours live in styles/tokens.css. */
export const GLOBE = {
  ocean: '#0a0e17',
  land: '#161c2a',
  coast: 'rgba(170, 190, 225, 0.22)',
  border: 'rgba(170, 190, 225, 0.12)',
  night: '#02040a',
};

/** Sun altitudes (°) of the stacked night bands: civil, nautical, astronomical twilight and a soft lead-in. */
export const NIGHT_BANDS = [3, 0, -6, -12, -18];

export function globeStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: 'globe' },
    glyphs: `${import.meta.env.BASE_URL}glyphs/{fontstack}/{range}.pbf`,
    sky: {
      // The atmosphere is lit by the real sun (see terminator.ts) – kept subtle, fading out when zooming in.
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.42, 3, 0.32, 6, 0],
    },
    sources: {
      // Coarse 110m geometry for the first frame; upgradeGeometry() swaps in 50m.
      land: { type: 'geojson', data: land110Url },
      borders: { type: 'geojson', data: borders110Url },
      night: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': GLOBE.ocean } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': GLOBE.land, 'fill-antialias': false } },
      {
        id: 'night',
        type: 'fill',
        source: 'night',
        paint: { 'fill-color': GLOBE.night, 'fill-opacity': 0.13, 'fill-antialias': false },
      },
      {
        id: 'coast',
        type: 'line',
        source: 'land',
        paint: { 'line-color': GLOBE.coast, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1] },
      },
      {
        id: 'borders',
        type: 'line',
        source: 'borders',
        paint: { 'line-color': GLOBE.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.3, 6, 0.8] },
      },
    ],
  };
}

/** Swap in the detailed 50m geometry once the first frame is on screen. */
export function upgradeGeometry(map: MapLibreMap) {
  map.once('idle', () => {
    (map.getSource('land') as GeoJSONSource | undefined)?.setData(land50Url);
    (map.getSource('borders') as GeoJSONSource | undefined)?.setData(borders50Url);
  });
}
