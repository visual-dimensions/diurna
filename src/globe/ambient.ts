import type maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Medium } from '../data/load';
import { headlineTime } from '../ui/livebar';
import { headlineLabel, inView } from './headlinelabel';

const LABEL_MS = 7000;
const TURN_MS = 240_000; // one full rotation in four minutes
const LAT = 30;

/**
 * "Screensaver of the world's news": the globe turns slowly and the latest
 * headlines float up at their newsrooms whenever these face the viewer.
 * Reduced motion: no rotation, labels appear and disappear without animation.
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
  private lng0 = 0;

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
    this.lng0 = this.map.getCenter().lng;
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

  /** The Earth turns eastwards, so the view drifts westwards over time. */
  private position(t: number) {
    const lng = ((((this.lng0 - (360 * t) / TURN_MS + 180) % 360) + 360) % 360) - 180;
    return { center: [lng, LAT] as [number, number], zoom: this.zoom() };
  }

  private resume() {
    this.lng0 = this.map.getCenter().lng; // continue from wherever the globe is now
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
    return inView(this.map, m.lon, m.lat);
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
    if (m) this.marker = headlineLabel(this.map, m, LABEL_MS);
    this.labelTimer = window.setTimeout(() => this.showNext(), LABEL_MS);
  }
}
