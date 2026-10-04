import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import type { Medium } from '../data/load';
import { escapeHtml } from '../ui/format';
import { headlineTime } from '../ui/livebar';

const LABEL_MS = 7000;
const SWEEP_LNG = { mid: 13, amp: 20, period: 160_000 };
const SWEEP_LAT = { mid: 48, amp: 4, period: 97_000 };

/**
 * "Screensaver of the world's news": the globe drifts slowly and the latest
 * headlines float up at their newsrooms, one after another.
 *
 * Data covers Europe only, so the camera sweeps back and forth over Europe
 * instead of turning the whole globe (most of a full turn would be empty).
 * Reduced motion: no drift, labels appear and disappear without animation.
 */
export class Ambient {
  active = false;
  private raf = 0;
  private labelTimer = 0;
  private marker: maplibregl.Marker | null = null;
  private media: Medium[] = [];
  private queue: Medium[] = [];
  private cursor = 0;
  private t0 = 0;

  onStop: () => void = () => {};

  constructor(
    private map: MapLibreMap,
    private reducedMotion: boolean,
    private zoom: () => number,
  ) {
    const stopOnInput = () => this.active && this.stop();
    map.getCanvasContainer().addEventListener('pointerdown', stopOnInput);
    map.getCanvasContainer().addEventListener('wheel', stopOnInput, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.active) return;
      if (document.hidden) this.pause();
      else this.resume();
    });
  }

  setMedia(media: Medium[]) {
    this.media = media.filter((m) => m.headline).sort((a, b) => headlineTime(b) - headlineTime(a));
  }

  /** Show these next (newly arrived headlines). */
  enqueue(media: Medium[]) {
    this.queue.push(...media.filter((m) => m.headline));
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.cursor = 0;
    this.map.once('moveend', () => this.active && this.resume());
    this.map.easeTo({ ...this.position(0), duration: this.reducedMotion ? 0 : 1600 });
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.pause();
    this.marker?.remove();
    this.marker = null;
    this.onStop();
  }

  private position(t: number) {
    const s = (p: { mid: number; amp: number; period: number }) => p.mid + p.amp * Math.sin((2 * Math.PI * t) / p.period);
    return { center: [s(SWEEP_LNG), s(SWEEP_LAT)] as [number, number], zoom: this.zoom() };
  }

  private resume() {
    this.t0 = performance.now();
    if (!this.reducedMotion) {
      const frame = (now: number) => {
        if (!this.active) return;
        this.map.jumpTo(this.position(now - this.t0));
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    }
    this.showNext();
  }

  private pause() {
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.labelTimer);
  }

  private onScreen(m: Medium): boolean {
    const p = this.map.project([m.lon, m.lat]);
    const { width, height } = this.map.getCanvas().getBoundingClientRect();
    return p.x > 140 && p.x < width - 140 && p.y > 180 && p.y < height - 60;
  }

  private nextMedium(): Medium | undefined {
    while (this.queue.length) {
      const m = this.queue.shift()!;
      if (this.onScreen(m)) return m;
    }
    for (let i = 0; i < this.media.length; i++) {
      const m = this.media[(this.cursor + i) % this.media.length];
      if (this.onScreen(m)) {
        this.cursor = (this.cursor + i + 1) % this.media.length;
        return m;
      }
    }
    return undefined;
  }

  private showNext() {
    if (!this.active) return;
    const m = this.nextMedium();
    this.marker?.remove();
    this.marker = null;
    if (m?.headline) {
      const en = m.lang !== 'en' ? m.headline.translations?.en : undefined;
      // Outer element is positioned by MapLibre (via transform), the inner one animates.
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = `<div class="ambient-label">
        <span class="ambient-label__masthead">${escapeHtml(m.name)} · ${escapeHtml(m.city)}</span>
        <span class="ambient-label__headline" lang="${escapeHtml(m.lang)}" dir="auto">${escapeHtml(m.headline.title)}</span>
        ${en ? `<span class="ambient-label__translation" lang="en">${escapeHtml(en)}</span>` : ''}
      </div>`;
      this.marker = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -14] }).setLngLat([m.lon, m.lat]).addTo(this.map);
    }
    this.labelTimer = window.setTimeout(() => this.showNext(), LABEL_MS);
  }
}
