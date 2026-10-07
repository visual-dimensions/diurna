import type { City } from '../data/load';
import { mediumCard } from './card';
import { countryName, escapeHtml, localTime } from './format';

/**
 * Full alternative to the globe: country → city → outlet, same data and
 * filters. Plain document structure (h2–h5, lists, links) so it works with
 * keyboard and screen readers without any extra machinery.
 *
 * Headlines live in per-country files: the structure renders at once, each
 * country's cards fill in as soon as its file is loaded (all countries are
 * requested when the list is shown, so nothing depends on scrolling).
 */
export class ListView {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private cities: City[] = [];
  private filtered = false;
  private generation = 0;
  /** Data changed while the list was hidden: build it on the next show(). */
  private stale = true;

  onShowCity: (cityKey: string) => void = () => {};
  loadCountry: (code: string) => Promise<void> = async () => {};

  constructor() {
    this.el = document.createElement('section');
    this.el.className = 'listview';
    this.el.id = 'list-view';
    this.el.setAttribute('aria-labelledby', 'list-title');
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="listview__inner">
        <h2 class="listview__title" id="list-title" tabindex="-1">All outlets</h2>
        <p class="listview__summary"></p>
        <div class="listview__body"></div>
      </div>`;
    this.body = this.el.querySelector('.listview__body')!;
    this.el.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-city]');
      if (button) this.onShowCity(button.dataset.city!);
    });
  }

  /**
   * New data or filters. While the list is hidden only remember them: with 1,200+ outlets the
   * full structure is ~7,000 elements, which would slow down the start of the globe for nothing.
   */
  render(cities: City[], filtered: boolean) {
    this.cities = cities;
    this.filtered = filtered;
    this.stale = true;
    if (!this.el.hidden) this.build();
  }

  private build() {
    this.stale = false;
    const cities = this.cities;
    const filtered = this.filtered;
    const generation = ++this.generation;
    const byCountry = this.byCountry();
    const outlets = cities.reduce((n, c) => n + c.media.length, 0);

    this.el.querySelector('.listview__summary')!.textContent = outlets
      ? `${outlets} outlets in ${byCountry.length} ${byCountry.length === 1 ? 'country' : 'countries'}${filtered ? ' (filtered)' : ''}.`
      : 'No outlets match the current filters.';

    this.body.innerHTML = byCountry
      .map(
        ([code, list]) => `<section class="listview__country" data-cc="${escapeHtml(code)}" aria-busy="true">
          <h3 class="listview__countryname">${escapeHtml(countryName(code))}</h3>
          ${list
            .map(
              (c) => `<section class="listview__city">
                <div class="listview__cityhead">
                  <h4 class="listview__cityname">${escapeHtml(c.name)} <span class="listview__time">${localTime(c.tz)} local time</span></h4>
                  <button type="button" class="text-button" data-city="${escapeHtml(c.key)}">Show on globe<span class="sr-only">: ${escapeHtml(c.name)}</span></button>
                </div>
                <ol class="listview__media" data-key="${escapeHtml(c.key)}">
                  ${c.media.map((m) => `<li class="card card--loading"><h5 class="card__masthead">${escapeHtml(m.name)}</h5></li>`).join('')}
                </ol>
              </section>`,
            )
            .join('')}
        </section>`,
      )
      .join('');

    if (!this.el.hidden) this.fill(generation);
  }

  show() {
    this.el.hidden = false;
    if (this.stale) this.build();
    this.el.scrollTop = 0;
    this.el.querySelector<HTMLElement>('#list-title')!.focus({ preventScroll: true });
    this.fill(this.generation);
  }

  hide() {
    this.el.hidden = true;
  }

  private byCountry(): [string, City[]][] {
    const map = new Map<string, City[]>();
    for (const c of this.cities) map.set(c.country, [...(map.get(c.country) ?? []), c]);
    for (const list of map.values()) list.sort((a, b) => b.media.length - a.media.length || a.name.localeCompare(b.name));
    return [...map].sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0]), 'en'));
  }

  /** Load every country's details and swap the placeholders for full cards. */
  private fill(generation: number) {
    for (const [code, list] of this.byCountry()) {
      this.loadCountry(code).then(() => {
        if (generation !== this.generation) return; // re-rendered meanwhile
        const section = this.body.querySelector<HTMLElement>(`[data-cc="${CSS.escape(code)}"]`);
        if (!section || section.getAttribute('aria-busy') === 'false') return;
        for (const c of list) {
          const ol = section.querySelector(`[data-key="${CSS.escape(c.key)}"]`);
          if (ol) ol.innerHTML = c.media.map((m) => mediumCard(m, 5)).join('');
        }
        section.setAttribute('aria-busy', 'false');
      });
    }
  }
}
