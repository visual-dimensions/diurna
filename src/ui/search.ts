import type { City, Medium } from '../data/load';
import { countryName, escapeHtml, fold } from './format';

export type SearchResult =
  | { kind: 'medium'; label: string; detail: string; medium: Medium }
  | { kind: 'city'; label: string; detail: string; cityKey: string }
  | { kind: 'country'; label: string; detail: string; country: string };

interface Entry {
  result: SearchResult;
  terms: string[];
  rank: number; // tie-breaker: media before cities before countries
}

const MAX_RESULTS = 8;

function buildIndex(media: Medium[], cities: City[]): Entry[] {
  const entries: Entry[] = [];
  for (const m of media) {
    entries.push({
      result: { kind: 'medium', label: m.name, detail: `${m.city}, ${countryName(m.city_country)}`, medium: m },
      terms: [fold(m.name), m.id],
      rank: m.tier,
    });
  }
  for (const c of cities) {
    entries.push({
      result: { kind: 'city', label: c.name, detail: `${countryName(c.country)} · ${c.media.length} ${c.media.length === 1 ? 'outlet' : 'outlets'}`, cityKey: c.key },
      terms: [fold(c.name)],
      rank: 4,
    });
  }
  const countries = new Map<string, number>();
  for (const m of media) countries.set(m.country, (countries.get(m.country) ?? 0) + 1);
  for (const [code, n] of countries) {
    const name = countryName(code);
    entries.push({
      result: { kind: 'country', label: name, detail: `${n} ${n === 1 ? 'outlet' : 'outlets'}`, country: code },
      terms: [fold(name), code.toLowerCase()],
      rank: 5,
    });
  }
  return entries;
}

function score(terms: string[], q: string): number {
  let best = 0;
  for (const t of terms) {
    if (t === q) best = Math.max(best, 4);
    else if (t.startsWith(q)) best = Math.max(best, 3);
    else if (t.split(/[\s\-'’.]+/).some((w) => w.startsWith(q))) best = Math.max(best, 2);
    else if (q.length >= 3 && t.includes(q)) best = Math.max(best, 1);
  }
  return best;
}

/**
 * Search pill as an ARIA 1.2 combobox: type, move with ↑/↓, Enter selects,
 * Escape clears. Searches media, cities and countries.
 */
export class Search {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private listbox: HTMLElement;
  private index: Entry[] = [];
  private results: SearchResult[] = [];
  private active = -1;

  onSelect: (r: SearchResult) => void = () => {};

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'search';
    this.el.innerHTML = `
      <label class="sr-only" for="search-input">Search outlets, cities or countries</label>
      <svg class="search__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <input id="search-input" class="search__input" type="search" placeholder="Outlet, city or country" autocomplete="off" spellcheck="false"
        role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="search-results" />
      <ul id="search-results" class="search__results" role="listbox" aria-label="Search results" hidden></ul>
      <p class="sr-only" aria-live="polite" id="search-status"></p>`;
    this.input = this.el.querySelector('input')!;
    this.listbox = this.el.querySelector('ul')!;

    this.input.addEventListener('input', () => this.update());
    this.input.addEventListener('focus', () => this.input.value && this.update());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.listbox.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus in the input
    this.listbox.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (li) this.choose(Number(li.dataset.i));
    });
    this.input.addEventListener('blur', () => this.hide());
  }

  setData(media: Medium[], cities: City[]) {
    this.index = buildIndex(media, cities);
    if (document.activeElement === this.input && this.input.value) this.update();
  }

  focus() {
    this.input.focus();
  }

  private update() {
    const q = fold(this.input.value.trim());
    if (!q) return this.hide();
    this.results = this.index
      .map((e) => ({ e, s: score(e.terms, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.e.rank - b.e.rank || a.e.result.label.localeCompare(b.e.result.label))
      .slice(0, MAX_RESULTS)
      .map((x) => x.e.result);
    this.active = this.results.length ? 0 : -1;
    this.render();
  }

  private render() {
    const status = this.el.querySelector('#search-status')!;
    if (!this.results.length) {
      const text = this.index.length ? 'No matches' : 'Loading outlets…';
      this.listbox.innerHTML = `<li class="search__empty" role="option" aria-disabled="true">${text}</li>`;
      status.textContent = text;
    } else {
      const kindLabel = { medium: 'Outlet', city: 'City', country: 'Country' };
      this.listbox.innerHTML = this.results
        .map(
          (r, i) => `<li id="search-opt-${i}" role="option" data-i="${i}" aria-selected="${i === this.active}" class="search__option">
            <span class="search__label">${escapeHtml(r.label)}</span>
            <span class="search__detail"><span class="search__kind">${kindLabel[r.kind]}</span> ${escapeHtml(r.detail)}</span>
          </li>`,
        )
        .join('');
      status.textContent = `${this.results.length} ${this.results.length === 1 ? 'result' : 'results'}`;
    }
    this.listbox.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.syncActive();
  }

  private syncActive() {
    this.listbox.querySelectorAll('[role=option][data-i]').forEach((li, i) => li.setAttribute('aria-selected', String(i === this.active)));
    if (this.active >= 0) {
      this.input.setAttribute('aria-activedescendant', `search-opt-${this.active}`);
      this.listbox.querySelector(`#search-opt-${this.active}`)?.scrollIntoView({ block: 'nearest' });
    } else {
      this.input.removeAttribute('aria-activedescendant');
    }
  }

  private onKey(e: KeyboardEvent) {
    const open = !this.listbox.hidden && this.results.length > 0;
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      this.active = (this.active + 1) % this.results.length;
      this.syncActive();
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      this.active = (this.active - 1 + this.results.length) % this.results.length;
      this.syncActive();
    } else if (e.key === 'Enter' && open && this.active >= 0) {
      e.preventDefault();
      this.choose(this.active);
    } else if (e.key === 'Escape') {
      if (!this.listbox.hidden || this.input.value) {
        e.stopPropagation();
        this.input.value = '';
        this.hide();
      }
    }
  }

  private choose(i: number) {
    const r = this.results[i];
    if (!r) return;
    this.input.value = '';
    this.hide();
    this.onSelect(r);
  }

  private hide() {
    this.listbox.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
  }
}
