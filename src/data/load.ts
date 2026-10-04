export type FeedKind = 'top' | 'latest' | 'none';
export type State = 'ok' | 'stale' | 'failing' | 'dead' | 'no_feed';

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
  tier: 1 | 2 | 3;
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
  key: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
  media: Medium[];
  level: Level;
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

export async function loadData(): Promise<{ cities: City[]; generatedAt: string | null }> {
  const base = import.meta.env.BASE_URL;
  const get = <T>(file: string) => fetch(`${base}data/${file}`, { cache: 'no-cache' }).then((r) => r.json() as Promise<T>);
  const [sources, headlines, status] = await Promise.all([
    get<Source[]>('sources.json'),
    get<HeadlinesFile>('headlines.json'),
    get<StatusFile>('status.json'),
  ]);

  const now = Date.now();
  const byCity = new Map<string, City>();
  for (const source of sources) {
    const medium = toMedium(source, headlines.items[source.id], status[source.id]?.state ?? 'no_feed', now);
    const key = `${source.city}|${source.city_country}`;
    let city = byCity.get(key);
    if (!city) {
      city = { key, name: source.city, country: source.city_country, lat: source.lat, lon: source.lon, tz: source.tz, media: [], level: 0 };
      byCity.set(key, city);
    }
    city.media.push(medium);
    city.level = Math.max(city.level, medium.level) as Level;
  }

  for (const city of byCity.values()) {
    // Freshest first, then tier.
    city.media.sort((a, b) => b.level - a.level || a.tier - b.tier || (a.ageMin ?? 1e9) - (b.ageMin ?? 1e9));
  }
  return { cities: [...byCity.values()], generatedAt: headlines.generated_at };
}
