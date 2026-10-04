import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/noto-serif/wght.css';
import '@fontsource-variable/inter/wght.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/tokens.css';
import './styles/app.css';

import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import { loadData, type City } from './data/load';
import { addMarkerLayers, citiesToGeoJSON, HIT_LAYER, pulseFresh } from './globe/markers';
import { globeStyle, NIGHT_BANDS } from './globe/style';
import { nightBands, sunLightPosition } from './globe/terminator';
import { CityPanel } from './ui/panel';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isNarrow = window.matchMedia('(max-width: 767px)').matches;

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
  <div class="stars" aria-hidden="true"></div>
  <div id="globe" class="globe"></div>
  <header class="topbar">
    <p class="wordmark">Diurna</p>
    <div class="search-pill" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <span>Medium, Stadt oder Land</span>
    </div>
  </header>
  <p class="statusline" aria-live="polite"></p>`;

const map = new maplibregl.Map({
  container: 'globe',
  style: globeStyle(),
  center: [15, 49],
  zoom: isNarrow ? 1.9 : 2.6,
  minZoom: 1,
  maxZoom: 8,
  maxPitch: 0,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
  attributionControl: false,
  dragRotate: false,
  touchPitch: false,
});
map.touchZoomRotate.disableRotation();
if (import.meta.env.DEV) Object.assign(window, { __map: map });
map.getCanvas().setAttribute('aria-label', 'Globus mit den Redaktionen Europas. Eine Listenansicht folgt.');

const panel = new CityPanel(app);
let cities: City[] = [];

function updateNight() {
  const now = new Date();
  (map.getSource('night') as GeoJSONSource | undefined)?.setData(nightBands(now, NIGHT_BANDS));
  map.setLight({ anchor: 'map', position: sunLightPosition(now), intensity: 0.4 });
}

function flyToCity(city: City) {
  const covered = isNarrowNow() ? { x: 0, y: -Math.min(236, window.innerHeight * 0.42) / 2 } : { x: -220, y: 0 };
  map.easeTo({
    center: [city.lon, city.lat],
    zoom: Math.max(map.getZoom(), 4),
    offset: [covered.x, covered.y],
    duration: reducedMotion ? 0 : 1000,
    easing: (t) => 1 - (1 - t) ** 3,
  });
}

function isNarrowNow() {
  return window.matchMedia('(max-width: 767px)').matches;
}

map.on('load', async () => {
  updateNight();
  window.setInterval(updateNight, 60_000);

  const data = await loadData();
  cities = data.cities;
  addMarkerLayers(map, citiesToGeoJSON(cities));
  pulseFresh(map, cities, reducedMotion);

  const media = cities.flatMap((c) => c.media);
  const withHeadline = media.filter((m) => m.headline).length;
  const stand = data.generatedAt
    ? new Intl.DateTimeFormat('de-AT', { hour: '2-digit', minute: '2-digit' }).format(new Date(data.generatedAt))
    : '–';
  document.querySelector('.statusline')!.innerHTML =
    `${media.length} Redaktionen · ${withHeadline} mit aktueller Schlagzeile<span class="statusline__stand"> · Stand ${stand}</span>`;

  map.on('click', HIT_LAYER, (e) => {
    // Hit areas (44 px) overlap for nearby cities – take the one closest to the tap.
    const distance = (c: City) => {
      const p = map.project([c.lon, c.lat]);
      return (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2;
    };
    const keys = new Set((e.features ?? []).map((f) => f.properties?.key as string));
    const city = cities.filter((c) => keys.has(c.key)).sort((a, b) => distance(a) - distance(b))[0];
    if (!city) return;
    panel.open(city);
    flyToCity(city);
  });
  map.on('click', (e) => {
    if (!map.queryRenderedFeatures(e.point, { layers: [HIT_LAYER] }).length) panel.close();
  });
  map.on('mouseenter', HIT_LAYER, () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', HIT_LAYER, () => (map.getCanvas().style.cursor = ''));
});

panel.onLayout = (bottom) => document.body.style.setProperty('--sheet-covered', `${bottom}px`);
