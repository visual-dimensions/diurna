import { activeFilterCount, defaultFilters, type Filters } from '../data/filter';
import type { Medium, Tier } from '../data/load';
import { countryName, escapeHtml, languageName, TIER_LABEL } from './format';

const ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

/** Filter button with a popover: language, country, importance, only with headline. Changes apply immediately. */
export class FilterControl {
  readonly el: HTMLElement;
  private button: HTMLButtonElement;
  private popover: HTMLElement;
  private filters: Filters = defaultFilters();

  onChange: (f: Filters) => void = () => {};

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'filters';
    this.el.innerHTML = `
      <button class="icon-button filters__toggle" type="button" aria-expanded="false" aria-controls="filters-popover">
        ${ICON}<span class="filters__label">Filters</span><span class="filters__badge" hidden></span>
      </button>
      <div class="filters__popover" id="filters-popover" role="group" aria-label="Filters" hidden>
        <label class="field field--check"><input type="checkbox" name="only" /> Only with a current headline</label>
        <label class="field"><span>Language</span><select name="lang"></select></label>
        <label class="field"><span>Country</span><select name="country"></select></label>
        <fieldset class="field">
          <legend>Importance</legend>
          ${([1, 2, 3] as Tier[])
            .map((t) => `<label class="field--check"><input type="checkbox" name="tier" value="${t}" checked /> ${TIER_LABEL[t]}</label>`)
            .join('')}
        </fieldset>
        <div class="filters__actions">
          <button type="button" class="text-button" data-action="reset">Reset</button>
          <button type="button" class="text-button text-button--strong" data-action="done">Done</button>
        </div>
      </div>`;
    this.button = this.el.querySelector('.filters__toggle')!;
    this.popover = this.el.querySelector('.filters__popover')!;

    this.button.addEventListener('click', () => this.toggle());
    this.popover.addEventListener('change', () => this.read());
    this.popover.querySelector('[data-action=reset]')!.addEventListener('click', () => {
      this.filters = defaultFilters();
      this.write();
      this.emit();
    });
    this.popover.querySelector('[data-action=done]')!.addEventListener('click', () => this.toggle(false, true));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.popover.hidden) {
        e.stopPropagation();
        this.toggle(false, true);
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.popover.hidden && !this.el.contains(e.target as Node)) this.toggle(false);
    });
  }

  setOptions(media: Medium[]) {
    const count = (key: 'lang' | 'country') => {
      const n = new Map<string, number>();
      for (const m of media) n.set(m[key], (n.get(m[key]) ?? 0) + 1);
      return n;
    };
    const options = (n: Map<string, number>, name: (c: string) => string, all: string) =>
      `<option value="">${all}</option>` +
      [...n]
        .map(([code, c]) => ({ code, label: name(code), c }))
        .sort((a, b) => a.label.localeCompare(b.label, 'en'))
        .map((o) => `<option value="${escapeHtml(o.code)}">${escapeHtml(o.label)} (${o.c})</option>`)
        .join('');
    this.popover.querySelector<HTMLSelectElement>('[name=lang]')!.innerHTML = options(count('lang'), languageName, 'All languages');
    this.popover.querySelector<HTMLSelectElement>('[name=country]')!.innerHTML = options(count('country'), countryName, 'All countries');
    this.write();
  }

  private toggle(open = this.popover.hidden, returnFocus = false) {
    this.popover.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (open) this.popover.querySelector<HTMLElement>('input, select')?.focus();
    else if (returnFocus) this.button.focus();
  }

  private read() {
    const q = <T extends HTMLElement>(s: string) => this.popover.querySelector<T>(s)!;
    this.filters = {
      onlyWithHeadline: q<HTMLInputElement>('[name=only]').checked,
      lang: q<HTMLSelectElement>('[name=lang]').value,
      country: q<HTMLSelectElement>('[name=country]').value,
      tiers: new Set(
        [...this.popover.querySelectorAll<HTMLInputElement>('[name=tier]:checked')].map((i) => Number(i.value) as Tier),
      ),
    };
    this.emit();
  }

  private write() {
    const q = <T extends HTMLElement>(s: string) => this.popover.querySelector<T>(s)!;
    q<HTMLInputElement>('[name=only]').checked = this.filters.onlyWithHeadline;
    q<HTMLSelectElement>('[name=lang]').value = this.filters.lang;
    q<HTMLSelectElement>('[name=country]').value = this.filters.country;
    this.popover.querySelectorAll<HTMLInputElement>('[name=tier]').forEach((i) => (i.checked = this.filters.tiers.has(Number(i.value) as Tier)));
  }

  private emit() {
    const n = activeFilterCount(this.filters);
    const badge = this.el.querySelector<HTMLElement>('.filters__badge')!;
    badge.hidden = n === 0;
    badge.textContent = String(n);
    this.button.setAttribute('aria-label', n ? `Filters, ${n} active` : 'Filters');
    this.onChange(this.filters);
  }
}
