import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/noto-serif/wght.css';
import '@fontsource-variable/inter/wght.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/tokens.css';
import './styles/app.css';

import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import { activeFilterCount, defaultFilters, filterCities, type Filters } from './data/filter';
import { groupByCity, loadData, type City, type Dataset } from './data/load';
import { addMarkerLayers, citiesToGeoJSON, HIT_LAYERS, pulseFresh, updateMarkers } from './globe/markers';
import { globeStyle, NIGHT_BANDS, upgradeGeometry } from './globe/style';
import { nightBands, sunLightPosition } from './globe/terminator';
import { FilterControl } from './ui/filters';
import { clockTime } from './ui/format';
import { ListView } from './ui/listview';
import { CityPanel, snapHeight } from './ui/panel';
import { Search, type SearchResult } from './ui/search';

const REFRESH_MS = 5 * 60_000;
const initialHash = decodeURIComponent(location.hash);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  </header>
  <p class="statusline" aria-live="polite"></p>`;

const search = new Search();
const filterControl = new FilterControl();
app.querySelector('.topbar__tools')!.append(search.el, filterControl.el);
const listView = new ListView();
app.append(listView.el);
const panel = new CityPanel(app);

// ---------- Map ----------

const map = new maplibregl.Map({
  container: 'globe',
  style: globeStyle(),
  center: [15, 49],
  zoom: narrowQuery.matches ? 1.9 : 2.6,
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
  app.querySelector('.statusline')!.innerHTML = activeFilterCount(filters)
    ? `${shown} of ${total} outlets shown · ${withHeadline} with a current headline`
    : `${total} outlets · ${withHeadline} with a current headline${updated}`;
}

function applyFilters() {
  if (!data) return;
  cities = filterCities(data.media, filters);
  updateMarkers(map, cities);
  listView.render(cities, activeFilterCount(filters) > 0);
  if (panel.currentKey) panel.refresh(cityByKey(panel.currentKey));
  updateStatus();
}

function setData(next: Dataset) {
  data = next;
  allCities = groupByCity([...next.media]);
  search.setData(next.media, allCities);
  filterControl.setOptions(next.media);
  applyFilters();
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
const firstData = loadData().then(setData, (err) => {
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
  pulseFresh(map, cities, reducedMotion);

  for (const layer of HIT_LAYERS) {
    map.on('click', layer, onMarkerClick);
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }
  map.on('click', (e) => {
    if (!map.queryRenderedFeatures(e.point, { layers: HIT_LAYERS }).length) panel.close();
  });

  // Deep links (#city=<key> or #list) – only if the visitor has not already navigated.
  if (!panel.isOpen && view === 'globe') followHash(initialHash);
  window.addEventListener('hashchange', () => followHash(decodeURIComponent(location.hash)));

  window.setInterval(async () => {
    try {
      setData(await loadData());
    } catch {
      /* keep showing the last data */
    }
  }, REFRESH_MS);
});
