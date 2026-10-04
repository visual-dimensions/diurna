import type { City } from '../data/load';
import { mediumCard } from './card';
import { trapFocus } from './focus';
import { countryName, localTime } from './format';

/**
 * City panel. Desktop: floating card on the right. Mobile (< 768 px): bottom
 * sheet with three snap points – peek (city + one headline, swipe sideways
 * through the media), half (list), full.
 */

export type Snap = 'peek' | 'half' | 'full';

const mobileQuery = window.matchMedia('(max-width: 767px)');

export function snapHeight(snap: Snap): number {
  const vh = window.innerHeight;
  if (snap === 'peek') return Math.min(236, vh * 0.42);
  if (snap === 'half') return vh * 0.56;
  return vh - 64;
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

  /** Called whenever the panel opens, closes or changes the area it covers. */
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
        <button class="panel__close" type="button" aria-label="Close">
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
    trapFocus(this.el, () => this.isOpen);
    // Keyboard users in the peek state: focusing a card expands the sheet so its links are visible.
    this.list.addEventListener('focusin', () => {
      if (mobileQuery.matches && this.snap === 'peek') this.setSnap('half');
    });
    this.setupDrag();
    mobileQuery.addEventListener('change', () => this.applySnap());
    window.addEventListener('resize', () => this.applySnap());
  }

  get isOpen() {
    return !this.el.hidden;
  }

  get currentKey() {
    return this.city?.key ?? null;
  }

  open(city: City, focusMediumId?: string) {
    if (!this.isOpen) this.returnFocus = document.activeElement as HTMLElement | null;
    this.render(city);
    this.list.scrollTo({ left: 0, top: 0 });
    this.el.hidden = false;
    this.snap = focusMediumId && city.media.length > 1 ? 'half' : 'peek';
    this.applySnap();
    window.clearInterval(this.clockTimer);
    this.clockTimer = window.setInterval(() => this.updateMeta(), 30_000);

    const card = focusMediumId ? this.list.querySelector<HTMLElement>(`[data-medium="${CSS.escape(focusMediumId)}"]`) : null;
    if (card) {
      card.classList.add('card--focus');
      card.scrollIntoView({ block: 'nearest', inline: 'start' });
      card.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
    } else {
      this.title.focus({ preventScroll: true });
    }
  }

  /** Re-render with fresh data, keeping snap point and scroll position. */
  refresh(city: City | undefined) {
    if (!this.isOpen) return;
    if (!city) return this.close();
    const { scrollTop, scrollLeft } = this.list;
    this.render(city);
    this.list.scrollTo({ top: scrollTop, left: scrollLeft });
  }

  close() {
    if (!this.isOpen) return;
    this.el.hidden = true;
    this.city = null;
    window.clearInterval(this.clockTimer);
    this.onLayout(0, 0);
    this.onClose();
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
  }

  private render(city: City) {
    this.city = city;
    this.title.textContent = city.name;
    this.updateMeta();
    this.list.innerHTML = city.media.map((m) => mediumCard(m, 3)).join('');
  }

  private updateMeta() {
    if (!this.city) return;
    const count = this.city.media.length;
    const time = localTime(this.city.tz);
    this.meta.textContent = [countryName(this.city.country), time && `${time} local time`, `${count} ${count === 1 ? 'outlet' : 'outlets'}`]
      .filter(Boolean)
      .join(' · ');
  }

  private setSnap(snap: Snap) {
    this.snap = snap;
    this.applySnap();
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
      velocity = 0;
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
      if (Math.abs(e.clientY - startY) < 6) {
        // A tap cycles through the snap points.
        return this.setSnap(this.snap === 'peek' ? 'half' : this.snap === 'half' ? 'full' : 'peek');
      }
      const visible = snapHeight('full') - (startOffset + e.clientY - startY);
      const order: Snap[] = ['peek', 'half', 'full'];
      if (visible < snapHeight('peek') * 0.6 && velocity > 0) return this.close();
      if (Math.abs(velocity) > 0.5) {
        const i = order.indexOf(this.snap) + (velocity < 0 ? 1 : -1);
        if (i < 0) return this.close();
        return this.setSnap(order[Math.min(2, i)]);
      }
      this.setSnap(order.reduce((best, s) => (Math.abs(snapHeight(s) - visible) < Math.abs(snapHeight(best) - visible) ? s : best)));
    };
    for (const el of [handle, grip]) {
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    }
  }
}
