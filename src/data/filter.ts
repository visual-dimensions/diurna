import { groupByCity, type City, type Medium, type Tier } from './load';

export interface Filters {
  lang: string; // '' = all
  country: string; // '' = all (country of origin, so exile media count for their home country)
  tiers: Set<Tier>;
  onlyWithHeadline: boolean;
}

export const defaultFilters = (): Filters => ({ lang: '', country: '', tiers: new Set([1, 2, 3]), onlyWithHeadline: false });

export function activeFilterCount(f: Filters): number {
  return Number(!!f.lang) + Number(!!f.country) + Number(f.tiers.size < 3) + Number(f.onlyWithHeadline);
}

export function matches(m: Medium, f: Filters): boolean {
  return (
    (!f.lang || m.lang === f.lang) &&
    (!f.country || m.country === f.country) &&
    f.tiers.has(m.tier) &&
    (!f.onlyWithHeadline || m.headlineAt !== null)
  );
}

export function filterCities(media: Medium[], f: Filters): City[] {
  return groupByCity(media.filter((m) => matches(m, f)));
}
