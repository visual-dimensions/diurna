import type { Medium } from '../data/load';
import { escapeHtml, relativeAge } from './format';

const ROTATE_MS = 6500;
const MAX_ITEMS = 15;

/** Recency of a headline in ms (published, else first_seen). */
export function headlineTime(m: Medium): number {
  return m.headline ? Date.parse(m.headline.published ?? m.headline.first_seen) : 0;
}

/**
 * A quiet strip with the most recent headlines ("12 min ago in Lisboa · …").
 * Rotates every few seconds; pauses on hover/focus and has an explicit
 * pause button (WCAG 2.2.2). With reduced motion it does not rotate on its
 * own – the arrows step through the items. Activating an item flies there.
 */
export class LiveBar {
  readonly el: HTMLElement;
  private item: HTMLButtonElement;
  private toggle: HTMLButtonElement;
  private items: Medium[] = [];
  private index = 0;
  private timer = 0;
  private paused: boolean;
  private hovered = false;

  onSelect: (m: Medium) => void = () => {};

  constructor(private reducedMotion: boolean) {
    this.paused = reducedMotion;
    this.el = document.createElement('section');
    this.el.className = 'livebar';
    this.el.setAttribute('aria-label', 'Latest headlines');
    this.el.innerHTML = `
      <span class="livebar__live" aria-hidden="true"><span class="livebar__dot"></span>Live</span>
      <button type="button" class="livebar__item"></button>
      <div class="livebar__controls">
        <button type="button" class="livebar__btn" data-step="-1" aria-label="Previous headline">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="livebar__btn livebar__toggle"></button>
        <button type="button" class="livebar__btn" data-step="1" aria-label="Next headline">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>`;
    this.item = this.el.querySelector('.livebar__item')!;
    this.toggle = this.el.querySelector('.livebar__toggle')!;

    this.item.addEventListener('click', () => this.items[this.index] && this.onSelect(this.items[this.index]));
    this.el.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) =>
      b.addEventListener('click', () => this.step(Number(b.dataset.step))),
    );
    this.toggle.addEventListener('click', () => {
      this.paused = !this.paused;
      this.syncToggle();
      this.schedule();
    });
    // Pause while the visitor is looking at or working with it.
    this.el.addEventListener('pointerenter', () => ((this.hovered = true), this.schedule()));
    this.el.addEventListener('pointerleave', () => ((this.hovered = false), this.schedule()));
    this.el.addEventListener('focusin', () => ((this.hovered = true), this.schedule()));
    this.el.addEventListener('focusout', () => ((this.hovered = false), this.schedule()));
    document.addEventListener('visibilitychange', () => this.schedule());
    this.syncToggle();
  }

  /** Update with the full media list; keeps showing the current item if it is still there. */
  setMedia(media: Medium[], jumpToNewest = false) {
    const current = this.items[this.index]?.id;
    this.items = media
      .filter((m) => m.headline)
      .sort((a, b) => headlineTime(b) - headlineTime(a))
      .slice(0, MAX_ITEMS);
    const keep = this.items.findIndex((m) => m.id === current);
    this.index = jumpToNewest || keep < 0 ? 0 : keep;
    this.el.hidden = this.items.length === 0;
    this.render(false);
    this.schedule();
  }

  private step(delta: number) {
    if (!this.items.length) return;
    this.index = (this.index + delta + this.items.length) % this.items.length;
    this.render(true);
    this.schedule();
  }

  private render(animate: boolean) {
    const m = this.items[this.index];
    if (!m?.headline) return;
    const age = relativeAge(Math.max(0, (Date.now() - headlineTime(m)) / 60000));
    const when = age === 'just now' ? 'Just now' : age.charAt(0).toUpperCase() + age.slice(1);
    // A glance at the strip should be understandable – show the English machine translation if there is one.
    const en = m.lang !== 'en' ? m.headline.translations?.en : undefined;
    const [text, lang] = en ? [en, 'en'] : [m.headline.title, m.lang];
    this.item.innerHTML = `
      <span class="livebar__where">${escapeHtml(when)} in ${escapeHtml(m.city)} · <span class="livebar__masthead">${escapeHtml(m.name)}</span>${en ? ' · <span class="livebar__mt">machine-translated</span>' : ''}</span>
      <span class="livebar__headline" lang="${escapeHtml(lang)}" dir="auto">${escapeHtml(text)}</span>
      <span class="sr-only">– show on globe</span>`;
    if (animate && !this.reducedMotion) {
      this.item.classList.remove('is-entering');
      void this.item.offsetWidth; // restart the CSS animation
      this.item.classList.add('is-entering');
    }
  }

  private syncToggle() {
    this.toggle.setAttribute('aria-label', this.paused ? 'Play headlines' : 'Pause headlines');
    this.toggle.innerHTML = this.paused
      ? `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 6l10 6-10 6z" fill="currentColor"/></svg>`
      : `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 6v12M16 6v12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  }

  private schedule() {
    window.clearTimeout(this.timer);
    if (this.paused || this.hovered || document.hidden || this.items.length < 2) return;
    this.timer = window.setTimeout(() => this.step(1), ROTATE_MS);
  }
}
