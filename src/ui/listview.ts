import type { City } from '../data/load';
import { mediumCard } from './card';
import { countryName, escapeHtml, localTime } from './format';

/**
 * Full alternative to the globe: country → city → outlet, same data and
 * filters. Plain document structure (h2–h5, lists, links) so it works with
 * keyboard and screen readers without any extra machinery.
 */
export class ListView {
  readonly el: HTMLElement;
  private body: HTMLElement;

  onShowCity: (cityKey: string) => void = () => {};

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

  render(cities: City[], filtered: boolean) {
    const byCountry = new Map<string, City[]>();
    for (const c of cities) {
      const list = byCountry.get(c.country) ?? [];
      list.push(c);
      byCountry.set(c.country, list);
    }
    const countries = [...byCountry].sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0]), 'en'));
    const outlets = cities.reduce((n, c) => n + c.media.length, 0);

    this.el.querySelector('.listview__summary')!.textContent = outlets
      ? `${outlets} outlets in ${countries.length} ${countries.length === 1 ? 'country' : 'countries'}${filtered ? ' (filtered)' : ''}.`
      : 'No outlets match the current filters.';

    this.body.innerHTML = countries
      .map(([code, list]) => {
        list.sort((a, b) => b.media.length - a.media.length || a.name.localeCompare(b.name));
        return `<section class="listview__country">
          <h3 class="listview__countryname">${escapeHtml(countryName(code))}</h3>
          ${list
            .map(
              (c) => `<section class="listview__city">
                <div class="listview__cityhead">
                  <h4 class="listview__cityname">${escapeHtml(c.name)} <span class="listview__time">${localTime(c.tz)} local time</span></h4>
                  <button type="button" class="text-button" data-city="${escapeHtml(c.key)}">Show on globe<span class="sr-only">: ${escapeHtml(c.name)}</span></button>
                </div>
                <ol class="listview__media">${c.media.map((m) => mediumCard(m, 5)).join('')}</ol>
              </section>`,
            )
            .join('')}
        </section>`;
      })
      .join('');
  }

  show() {
    this.el.hidden = false;
    this.el.scrollTop = 0;
    this.el.querySelector<HTMLElement>('#list-title')!.focus({ preventScroll: true });
  }

  hide() {
    this.el.hidden = true;
  }
}
