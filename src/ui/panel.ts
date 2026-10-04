import type { City, Medium } from '../data/load';
import { countryName, escapeHtml, localTime, relativeAge } from './format';

/**
 * City panel. Desktop: floating card on the right. Mobile (< 768 px): bottom
 * sheet with three snap points – peek (city + one headline, swipe sideways
 * through the media), half (list), full.
 */

export type Snap = 'peek' | 'half' | 'full';

const mobileQuery = window.matchMedia('(max-width: 767px)');

function snapHeight(snap: Snap): number {
  const vh = window.innerHeight;
  if (snap === 'peek') return Math.min(236, vh * 0.42);
  if (snap === 'half') return vh * 0.56;
  return vh - 64;
}

function mediumCard(m: Medium): string {
  const name = escapeHtml(m.name);
  const exile = m.note === 'exile'
    ? `<p class="card__note">Exilmedium aus ${escapeHtml(countryName(m.country))}</p>`
    : '';
  const home = `<a class="card__link card__link--quiet" href="${escapeHtml(m.homepage)}" target="_blank" rel="noopener">Zur Startseite<span class="sr-only"> von ${name}</span></a>`;

  if (!m.headline) {
    return `<li class="card card--l0">
      <p class="card__masthead">${name}</p>
      ${exile}
      <p class="card__empty">Keine aktuelle Schlagzeile</p>
      <p class="card__links">${home}</p>
    </li>`;
  }

  const kind = m.feed_kind === 'top' ? 'Aufmacher' : 'Neuester Beitrag';
  const age = m.ageMin !== null ? `<span aria-hidden="true">·</span> <span>${relativeAge(m.ageMin)}</span>` : '';
  return `<li class="card card--l${m.level}">
    <p class="card__masthead">${name}</p>
    ${exile}
    <p class="card__meta"><span class="card__kind">${kind}</span> ${age}</p>
    <h3 class="card__headline" lang="${escapeHtml(m.lang)}" dir="auto">${escapeHtml(m.headline.title)}</h3>
    <p class="card__links">
      <a class="card__link" href="${escapeHtml(m.headline.url)}" target="_blank" rel="noopener">Zum Artikel<span class="sr-only"> bei ${name}</span> <span aria-hidden="true">↗</span></a>
      ${home}
    </p>
  </li>`;
}

export class CityPanel {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private title: HTMLElement;
  private meta: HTMLElement;
  private snap: Snap = 'peek';
  private city: City | null = null;
  private clockTimer = 0;
  private returnFocus: HTMLElement | null = null;

  /** Called whenever the panel opens, closes or changes its covered height. */
  onLayout: (coveredBottom: number, coveredRight: number) => void = () => {};
  onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement('aside');
    this.el.className = 'panel';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-labelledby', 'panel-title');
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="panel__grip" aria-hidden="true"><span></span></div>
      <header class="panel__header">
        <div>
          <p class="panel__meta"></p>
          <h2 class="panel__title" id="panel-title" tabindex="-1"></h2>
        </div>
        <button class="panel__close" type="button" aria-label="Schließen">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        </button>
      </header>
      <ol class="panel__list"></ol>`;
    parent.append(this.el);
    this.list = this.el.querySelector('.panel__list')!;
    this.title = this.el.querySelector('.panel__title')!;
    this.meta = this.el.querySelector('.panel__meta')!;

    this.el.querySelector('.panel__close')!.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    this.setupDrag();
    mobileQuery.addEventListener('change', () => this.applySnap());
    window.addEventListener('resize', () => this.applySnap());
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open(city: City) {
    if (!this.isOpen) this.returnFocus = document.activeElement as HTMLElement | null;
    this.city = city;
    this.title.textContent = city.name;
    this.updateClock();
    window.clearInterval(this.clockTimer);
    this.clockTimer = window.setInterval(() => this.updateClock(), 30_000);

    this.list.innerHTML = city.media.map(mediumCard).join('');
    this.list.scrollTo({ left: 0, top: 0 });
    this.el.hidden = false;
    this.snap = 'peek';
    this.applySnap();
    this.title.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.el.hidden = true;
    this.city = null;
    window.clearInterval(this.clockTimer);
    this.onLayout(0, 0);
    this.onClose();
    this.returnFocus?.focus({ preventScroll: true });
  }

  private updateClock() {
    if (!this.city) return;
    const count = this.city.media.length;
    const time = localTime(this.city.tz);
    this.meta.textContent = [countryName(this.city.country), time && `${time} Ortszeit`, `${count} ${count === 1 ? 'Medium' : 'Medien'}`]
      .filter(Boolean)
      .join(' · ');
  }

  private applySnap() {
    if (!this.isOpen) return;
    if (mobileQuery.matches) {
      const h = snapHeight(this.snap);
      this.el.dataset.snap = this.snap;
      this.el.style.setProperty('--sheet-offset', `${snapHeight('full') - h}px`);
      this.onLayout(h, 0);
    } else {
      delete this.el.dataset.snap;
      this.el.style.removeProperty('--sheet-offset');
      this.onLayout(0, this.el.getBoundingClientRect().width + 24);
    }
  }

  /** Drag the sheet by its grip/header; release snaps to the nearest point (flicks win). */
  private setupDrag() {
    const handle = this.el.querySelector<HTMLElement>('.panel__header')!;
    const grip = this.el.querySelector<HTMLElement>('.panel__grip')!;
    let startY = 0;
    let startOffset = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let dragging = false;

    const down = (e: PointerEvent) => {
      if (!mobileQuery.matches || (e.target as HTMLElement).closest('button')) return;
      dragging = true;
      startY = lastY = e.clientY;
      lastT = e.timeStamp;
      startOffset = snapHeight('full') - snapHeight(this.snap);
      this.el.classList.add('is-dragging');
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const offset = Math.min(snapHeight('full') - 80, Math.max(0, startOffset + e.clientY - startY));
      this.el.style.setProperty('--sheet-offset', `${offset}px`);
      velocity = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
      lastY = e.clientY;
      lastT = e.timeStamp;
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      this.el.classList.remove('is-dragging');
      const moved = Math.abs(e.clientY - startY);
      if (moved < 6) {
        // Tap on the grip cycles through the snap points.
        this.snap = this.snap === 'peek' ? 'half' : this.snap === 'half' ? 'full' : 'peek';
        this.applySnap();
        return;
      }
      const visible = snapHeight('full') - (startOffset + e.clientY - startY);
      const order: Snap[] = ['peek', 'half', 'full'];
      if (visible < snapHeight('peek') * 0.6 && velocity > 0) return this.close();
      let target: Snap;
      if (Math.abs(velocity) > 0.5) {
        const i = order.indexOf(this.snap) + (velocity < 0 ? 1 : -1);
        if (i < 0) return this.close();
        target = order[Math.min(2, i)];
      } else {
        target = order.reduce((best, s) => (Math.abs(snapHeight(s) - visible) < Math.abs(snapHeight(best) - visible) ? s : best));
      }
      this.snap = target;
      this.applySnap();
    };
    for (const el of [handle, grip]) {
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
  }
}
