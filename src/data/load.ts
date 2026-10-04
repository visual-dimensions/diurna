export type FeedKind = 'top' | 'latest' | 'none';
export type State = 'ok' | 'stale' | 'failing' | 'dead' | 'no_feed';
export type Tier = 1 | 2 | 3;

export interface Source {
  id: string;
  name: string;
  country: string;
  city: string;
  city_country: string;
  lat: number;
  lon: number;
  tz: string;
  lang: string;
  type: 'daily' | 'weekly' | 'online' | 'magazine';
  tier: Tier;
  homepage: string;
  feed_kind: FeedKind;
  note: string;
}

export interface Headline {
  title: string;
  url: string;
  published: string | null;
  first_seen: string;
  feed_updated: string | null;
}

/** 3 = fresh (< 1 h), 2 = 1–12 h, 1 = older but feed alive, 0 = no current headline. */
export type Level = 0 | 1 | 2 | 3;

export interface Medium extends Source {
  headline: Headline | null;
  state: State;
  /** Age of the headline in minutes (published, else first_seen). */
  ageMin: number | null;
  level: Level;
}

export interface City {
  /** Stable key: "<city>|<country of the newsroom>". */
  key: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
  media: Medium[];
  level: Level;
  /** Only regional (tier 3) media – faded in when zooming in. */
  minor: boolean;
}

export interface Dataset {
  cities: City[];
  media: Medium[];
  generatedAt: string | null;
}

interface HeadlinesFile {
  generated_at: string | null;
  items: Record<string, Headline>;
}

type StatusFile = Record<string, { state: State }>;

const HIDDEN_STATES: State[] = ['stale', 'dead', 'no_feed'];

export function levelFor(ageMin: number | null): Level {
  if (ageMin === null) return 1;
  if (ageMin < 60) return 3;
  if (ageMin < 12 * 60) return 2;
  return 1;
}

function toMedium(source: Source, headline: Headline | undefined, state: State, now: number): Medium {
  const visible = headline && !HIDDEN_STATES.includes(state) ? headline : null;
  const ref = visible ? (visible.published ?? visible.first_seen) : null;
  const ageMin = ref ? Math.max(0, (now - Date.parse(ref)) / 60000) : null;
  return { ...source, headline: visible, state, ageMin, level: visible ? levelFor(ageMin) : 0 };
}

/** Freshest first, then tier, then age. */
export function sortMedia(media: Medium[]): Medium[] {
  return media.sort((a, b) => b.level - a.level || a.tier - b.tier || (a.ageMin ?? 1e9) - (b.ageMin ?? 1e9));
}

/** Group media by newsroom city. */
export function groupByCity(media: Medium[]): City[] {
  const byCity = new Map<string, City>();
  for (const m of media) {
    const key = `${m.city}|${m.city_country}`;
    let city = byCity.get(key);
    if (!city) {
      city = { key, name: m.city, country: m.city_country, lat: m.lat, lon: m.lon, tz: m.tz, media: [], level: 0, minor: true };
      byCity.set(key, city);
    }
    city.media.push(m);
    city.level = Math.max(city.level, m.level) as Level;
    city.minor &&= m.tier === 3;
  }
  for (const city of byCity.values()) sortMedia(city.media);
  return [...byCity.values()];
}

export async function loadData(): Promise<Dataset> {
  const base = import.meta.env.BASE_URL;
  const get = <T>(file: string) =>
    fetch(`${base}data/${file}`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
      return r.json() as Promise<T>;
    });
  const [sources, headlines, status] = await Promise.all([
    get<Source[]>('sources.json'),
    get<HeadlinesFile>('headlines.json'),
    get<StatusFile>('status.json'),
  ]);

  const now = Date.now();
  const media = sources.map((s) => toMedium(s, headlines.items[s.id], status[s.id]?.state ?? 'no_feed', now));
  return { cities: groupByCity(media), media, generatedAt: headlines.generated_at };
}
