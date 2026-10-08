import maplibregl, { LngLat, type Map as MapLibreMap } from 'maplibre-gl';
import type { Medium } from '../data/load';
import { escapeHtml } from '../ui/format';
import { ensureScriptFont } from '../ui/scriptfonts';

/**
 * Is this place on the visible side of the globe and away from the edges
 * (top bar, live bar, label width)? Points behind the globe also project
 * into the canvas, hence the occlusion test.
 */
export function inView(map: MapLibreMap, lon: number, lat: number): boolean {
  if (map.transform.isLocationOccluded(new LngLat(lon, lat))) return false;
  const p = map.project([lon, lat]);
  const { width, height } = map.getCanvas().getBoundingClientRect();
  const side = Math.min(140, width / 3);
  return p.x > side && p.x < width - side && p.y > 180 && p.y < height - 120;
}

/**
 * A headline floating above its newsroom (ambient mode, live bar). Decorative:
 * the same text is in the live bar or the panel, so it is hidden from screen readers.
 * `duration` = how long it stays before fading out (CSS animation).
 */
export function headlineLabel(map: MapLibreMap, m: Medium, duration: number): maplibregl.Marker | null {
  if (!m.headline) return null;
  const en = m.lang !== 'en' ? m.headline.translations?.en : undefined;
  ensureScriptFont(m.lang);
  // Outer element is positioned by MapLibre (via transform), the inner one animates.
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="ambient-label">
    <span class="ambient-label__masthead">${escapeHtml(m.name)} · ${escapeHtml(m.city)}</span>
    <span class="ambient-label__headline" lang="${escapeHtml(m.lang)}" dir="auto">${escapeHtml(m.headline.title)}</span>
    ${en ? `<span class="ambient-label__translation" lang="en">${escapeHtml(en)}</span>` : ''}
  </div>`;
  (el.firstElementChild as HTMLElement).style.animationDuration = `${duration}ms`;
  return new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -14] }).setLngLat([m.lon, m.lat]).addTo(map);
}
