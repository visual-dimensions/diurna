import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/noto-serif/wght.css';
import '@fontsource-variable/inter/wght.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/tokens.css';
import './styles/app.css';

import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import { activeFilterCount, defaultFilters, filterCities, type Filters } from './data/filter';
import { groupByCity, loadData, type City, type Dataset, type Medium } from './data/load';
import { Ambient } from './globe/ambient';
import { INTRO_START, introWanted, playIntro } from './globe/intro';
import { addMarkerLayers, citiesToGeoJSON, HIT_LAYERS, pulse, updateMarkers } from './globe/markers';
import { globeStyle, NIGHT_BANDS, upgradeGeometry } from './globe/style';
import { nightBands, sunLightPosition } from './globe/terminator';
import { FilterControl } from './ui/filters';
import { clockTime } from './ui/format';
import { LiveBar } from './ui/livebar';
import { ListView } from './ui/listview';
import { CityPanel, snapHeight } from './ui/panel';
import { Search, type SearchResult } from './ui/search';

const REFRESH_MS = 5 * 60_000;
const initialHash = decodeURIComponent(location.hash);
const reducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
  // Dev only: test the reduced-motion paths without changing the OS setting.
  (import.meta.env.DEV && new URLSearchParams(location.search).has('reduced-motion'));
if (reducedMotion) document.documentElement.dataset.reducedMotion = 'true';
const narrowQuery = window.matchMedia('(max-width: 767px)');

type View = 'globe' | 'list';

// ---------- DOM skeleton ----------

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
  <a class="skip-link" href="#list-view">Skip to list of all outlets</a>
  <div class="stars" aria-hidden="true"></div>
  <div id="globe" class="globe"></div>
  <header class="topbar">
    <h1 class="wordmark">Diurna</h1>
    <div class="topbar__tools"></div>
    <div class="topbar__right">
    <button type="button" class="icon-button ambient-toggle" aria-pressed="false">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3.5l1.6 4.9 4.9 1.6-4.9 1.6L12 16.5l-1.6-4.9L5.5 10l4.9-1.6zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor"/></svg>
      <span class="ambient-toggle__label">Ambient</span>
    </button>
    <div class="viewtoggle" role="group" aria-label="View">
      <button type="button" class="viewtoggle__btn" data-view="globe" aria-pressed="true">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 12h16M12 4c2.5 2.6 2.5 13.4 0 16M12 4c-2.5 2.6-2.5 13.4 0 16" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>Globe</span>
      </button>
      <button type="button" class="viewtoggle__btn" data-view="list" aria-pressed="false">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 7h11M8 12h11M8 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <span>List</span>
      </button>
    </div>
    </div>
  </header>
  <div class="dock">
    <p class="statusline" aria-live="polite"></p>
  </div>`;

const search = new Search();
const filterControl = new FilterControl();
app.querySelector('.topbar__tools')!.append(search.el, filterControl.el);
const listView = new ListView();
app.append(listView.el);
const panel = new CityPanel(app);
const liveBar = new LiveBar(reducedMotion);
app.querySelector('.dock')!.append(liveBar.el);
const ambientButton = app.querySelector<HTMLButtonElement>('.ambient-toggle')!;

// ---------- Map ----------

const HOME = { center: [15, 49] as [number, number], zoom: narrowQuery.matches ? 1.9 : 2.6 };
const withIntro = introWanted(reducedMotion, initialHash.length > 1);

const map = new maplibregl.Map({
  container: 'globe',
  style: globeStyle(),
  ...(withIntro ? INTRO_START : HOME),
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
map
  .getCanvas()
  .setAttribute('aria-label', 'Globe showing newsrooms across Europe. Use the search, or switch to the list view for every outlet and headline.');

const ambient = new Ambient(map, reducedMotion, () => (narrowQuery.matches ? 1.9 : 2.3));

// ---------- State ----------

let data: Dataset | null = null;
let allCities: City[] = [];
let cities: City[] = []; // filtered
let filters: Filters = defaultFilters();
let view: View = 'globe';

function cityByKey(key: string, list = cities) {
  return list.find((c) => c.key === key);
}

function updateNight() {
  const now = new Date();
  (map.getSource('night') as GeoJSONSource | undefined)?.setData(nightBands(now, NIGHT_BANDS));
  map.setLight({ anchor: 'map', position: sunLightPosition(now), intensity: 0.4 });
}

function camera(duration: number) {
  return { duration: reducedMotion ? 0 : duration, easing: (t: number) => 1 - (1 - t) ** 3 };
}

function flyToCity(city: City) {
  const offset: [number, number] = narrowQuery.matches ? [0, -snapHeight('peek') / 2] : [-220, 0];
  map.easeTo({ center: [city.lon, city.lat], zoom: Math.max(map.getZoom(), 4), offset, ...camera(1000) });
}

function flyToCountry(code: string) {
  const points = allCities.filter((c) => c.media.some((m) => m.country === code));
  if (!points.length) return;
  const bounds = new maplibregl.LngLatBounds();
  points.forEach((c) => bounds.extend([c.lon, c.lat]));
  map.fitBounds(bounds, { padding: narrowQuery.matches ? 70 : 140, maxZoom: 5.5, ...camera(1200) });
}

function openCity(key: string, mediumId?: string) {
  // From the search, an outlet may be hidden by filters – then show its whole city.
  const city = cityByKey(key) ?? cityByKey(key, allCities);
  if (!city) return;
  ambient.stop();
  if (view !== 'globe') setView('globe', false);
  panel.open(city, mediumId);
  flyToCity(city);
  history.replaceState(null, '', `#city=${encodeURIComponent(key)}`);
}

function setView(next: View, moveFocus = true) {
  view = next;
  document.body.dataset.view = next;
  app.querySelectorAll<HTMLElement>('.viewtoggle__btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === next)));
  if (next === 'list') {
    ambient.stop();
    panel.close();
    listView.show();
    history.replaceState(null, '', '#list');
  } else {
    listView.hide();
    if (moveFocus) map.getCanvas().focus();
    if (location.hash === '#list') history.replaceState(null, '', location.pathname);
  }
}

function updateStatus() {
  if (!data) return;
  const total = data.media.length;
  const shown = cities.reduce((n, c) => n + c.media.length, 0);
  const withHeadline = cities.reduce((n, c) => n + c.media.filter((m) => m.headline).length, 0);
  const updated = data.generatedAt ? `<span class="statusline__stand"> · Updated ${clockTime(data.generatedAt)}</span>` : '';
  const about = ` · <a class="statusline__about" href="/about/">About</a>`;
  app.querySelector('.statusline')!.innerHTML =
    (activeFilterCount(filters)
      ? `${shown} of ${total} outlets shown · ${withHeadline} with a current headline`
      : `${total} outlets · ${withHeadline} with a current headline${updated}`) + about;
}

function applyFilters() {
  if (!data) return;
  cities = filterCities(data.media, filters);
  updateMarkers(map, cities);
  listView.render(cities, activeFilterCount(filters) > 0);
  if (panel.currentKey) panel.refresh(cityByKey(panel.currentKey));
  updateStatus();
}

/** Media whose headline changed since the previous dataset (empty on the first load). */
function newHeadlines(prev: Dataset | null, next: Dataset): Medium[] {
  if (!prev) return [];
  const before = new Map(prev.media.map((m) => [m.id, m.headline?.url]));
  return next.media.filter((m) => m.headline && before.get(m.id) !== m.headline.url);
}

function setData(next: Dataset) {
  const fresh = newHeadlines(data, next);
  data = next;
  allCities = groupByCity([...next.media]);
  search.setData(next.media, allCities);
  filterControl.setOptions(next.media);
  applyFilters();
  liveBar.setMedia(next.media, fresh.length > 0);
  ambient.setMedia(next.media);
  if (fresh.length) {
    // New headlines "ignite": a pulse at their cities, and they float up first in ambient mode.
    const keys = new Set(fresh.map((m) => `${m.city}|${m.city_country}`));
    pulse(map, cities.filter((c) => keys.has(c.key)), reducedMotion);
    ambient.enqueue(fresh);
  }
}

function setAmbient(on: boolean) {
  if (on) {
    if (view !== 'globe') setView('globe', false);
    panel.close();
    ambient.start();
  } else {
    ambient.stop();
  }
  document.body.dataset.ambient = String(ambient.active);
  ambientButton.setAttribute('aria-pressed', String(ambient.active));
}

function onSearch(r: SearchResult) {
  if (r.kind === 'medium') openCity(`${r.medium.city}|${r.medium.city_country}`, r.medium.id);
  else if (r.kind === 'city') openCity(r.cityKey);
  else {
    if (view !== 'globe') setView('globe', false);
    panel.close();
    flyToCountry(r.country);
  }
}

function onMarkerClick(e: MapLayerMouseEvent) {
  // Hit areas (44 px) overlap for nearby cities – take the one closest to the tap.
  const distance = (c: City) => {
    const p = map.project([c.lon, c.lat]);
    return (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2;
  };
  const keys = new Set((e.features ?? []).map((f) => f.properties?.key as string));
  const city = cities.filter((c) => keys.has(c.key)).sort((a, b) => distance(a) - distance(b))[0];
  if (city) openCity(city.key);
}

function followHash(hash: string) {
  if (hash === '#list') setView('list');
  else if (hash.startsWith('#city=')) openCity(hash.slice(6));
}

// ---------- Wiring ----------

search.onSelect = onSearch;
filterControl.onChange = (f) => {
  filters = f;
  applyFilters();
};
listView.onShowCity = (key) => openCity(key);
liveBar.onSelect = (m) => openCity(`${m.city}|${m.city_country}`, m.id);
ambient.onStop = () => {
  document.body.dataset.ambient = 'false';
  ambientButton.setAttribute('aria-pressed', 'false');
};
ambientButton.addEventListener('click', () => setAmbient(!ambient.active));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ambient.active) ambient.stop();
});
panel.onClose = () => {
  if (location.hash.startsWith('#city=')) history.replaceState(null, '', location.pathname);
};
app.querySelectorAll<HTMLElement>('.viewtoggle__btn').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view as View)));
app.querySelector('.skip-link')!.addEventListener('click', (e) => {
  e.preventDefault();
  setView('list');
});
document.body.dataset.view = 'globe';

// Data loads in parallel with the map; search and list view work as soon as it arrives.
const firstData = loadData().then((d) => {
  setData(d);
  if (initialHash === '#list') setView('list');
}, (err) => {
  console.error(err);
  app.querySelector('.statusline')!.textContent = 'Headlines could not be loaded. Please try again later.';
  throw err;
});

map.on('load', async () => {
  updateNight();
  window.setInterval(updateNight, 60_000);
  upgradeGeometry(map);

  try {
    await firstData;
  } catch {
    return;
  }
  addMarkerLayers(map, citiesToGeoJSON(cities));
  if (withIntro) playIntro(map, cities, HOME);
  else pulse(map, cities, reducedMotion, 1400);

  for (const layer of HIT_LAYERS) {
    map.on('click', layer, onMarkerClick);
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }
  map.on('click', (e) => {
    if (!map.queryRenderedFeatures(e.point, { layers: HIT_LAYERS }).length) panel.close();
  });

  // City deep links need the map; #list is handled as soon as the data is there (see firstData).
  if (!panel.isOpen && view === 'globe' && initialHash.startsWith('#city=')) followHash(initialHash);
  window.addEventListener('hashchange', () => followHash(decodeURIComponent(location.hash)));

  window.setInterval(async () => {
    try {
      setData(await loadData());
    } catch {
      /* keep showing the last data */
    }
  }, REFRESH_MS);
});
