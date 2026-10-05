export type FeedKind = 'top' | 'latest' | 'none';
export type State = 'ok' | 'stale' | 'failing' | 'dead' | 'no_feed';
export type Tier = 1 | 2 | 3;

export interface Headline {
  title: string;
  url: string;
  published?: string;
  first_seen?: string;
  /** Machine translations by target language, e.g. { en: "…" } (scripts/translate_headlines.py). */
  translations?: Record<string, string>;
}

/** 3 = fresh (< 1 h), 2 = 1–12 h, 1 = older but feed alive, 0 = no current headline. */
export type Level = 0 | 1 | 2 | 3;

export interface Medium {
  id: string;
  name: string;
  /** Country of origin (differs from city_country for media in exile). */
  country: string;
  city: string;
  city_country: string;
  lat: number;
  lon: number;
  tz: string;
  lang: string;
  type: 'daily' | 'weekly' | 'online' | 'magazine';
  tier: Tier;
  feed_kind: FeedKind;
  /** 'exile' | 'state' | '' – see CLAUDE.md, data model. */
  note: string;
  state: State;
  /** Time of the current headline (ms), null = no current headline. From the index. */
  headlineAt: number | null;
  /** Short hash that changes with the headline. */
  hash: string | null;
  ageMin: number | null;
  level: Level;
  // Details – filled in per country by DataStore.ensureCountries():
  headline: Headline | null;
  homepage: string;
  note_source?: string;
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
  /** Best (lowest) tier among its media – decides from which zoom on the city shows. */
  minTier: Tier;
}

interface IndexFile {
  generated_at: string | null;
  cities: { name: string; cc: string; lat: number; lon: number; tz: string }[];
  media: {
    id: string;
    name: string;
    c: number;
    country?: string;
    lang: string;
    type: Medium['type'];
    tier: Tier;
    kind: FeedKind;
    state: State;
    note?: string;
    t?: number;
    h?: string;
  }[];
}

interface Detail extends Partial<Headline> {
  homepage: string;
  note_source?: string;
}

interface CountryFile {
  generated_at: string | null;
  media: Record<string, Detail>;
}

interface LatestFile {
  generated_at: string | null;
  items: ({ id: string; t: string } & Partial<Headline> & { title: string })[];
}

export function levelFor(ageMin: number | null): Level {
  if (ageMin === null) return 1;
  if (ageMin < 60) return 3;
  if (ageMin < 12 * 60) return 2;
  return 1;
}

/** Freshest first, then tier, then age. */
export function sortMedia(media: Medium[]): Medium[] {
  return media.sort((a, b) => b.level - a.level || a.tier - b.tier || (a.ageMin ?? 1e9) - (b.ageMin ?? 1e9));
}

export const cityKey = (m: Pick<Medium, 'city' | 'city_country'>) => `${m.city}|${m.city_country}`;

/** Group media by newsroom city. */
export function groupByCity(media: Medium[]): City[] {
  const byCity = new Map<string, City>();
  for (const m of media) {
    const key = cityKey(m);
    let city = byCity.get(key);
    if (!city) {
      city = { key, name: m.city, country: m.city_country, lat: m.lat, lon: m.lon, tz: m.tz, media: [], level: 0, minTier: 3 };
      byCity.set(key, city);
    }
    city.media.push(m);
    city.level = Math.max(city.level, m.level) as Level;
    city.minTier = Math.min(city.minTier, m.tier) as Tier;
  }
  for (const city of byCity.values()) sortMedia(city.media);
  return [...byCity.values()];
}

const base = import.meta.env.BASE_URL;

async function getJSON<T>(file: string): Promise<T> {
  const r = await fetch(`${base}data/${file}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

/**
 * Frontend data in three layers (see scripts/build_frontend_data.py):
 * the index (always), details per newsroom country (on demand) and the
 * latest headlines (live bar, ambient mode).
 */
export class DataStore {
  media: Medium[] = [];
  generatedAt: string | null = null;
  private byId = new Map<string, Medium>();
  private details = new Map<string, Promise<CountryFile | null>>();

  /** Load (or reload) the index. Returns the media whose headline changed since the last load. */
  async loadIndex(): Promise<Medium[]> {
    const index = await getJSON<IndexFile>('index.json');
    const previous = this.byId;
    const now = Date.now();
    if (index.generated_at !== this.generatedAt) this.details.clear();
    this.generatedAt = index.generated_at;

    this.media = index.media.map((e) => {
      const c = index.cities[e.c];
      const headlineAt = e.t != null ? e.t * 60_000 : null;
      const ageMin = headlineAt !== null ? Math.max(0, (now - headlineAt) / 60_000) : null;
      return {
        id: e.id,
        name: e.name,
        country: e.country ?? c.cc,
        city: c.name,
        city_country: c.cc,
        lat: c.lat,
        lon: c.lon,
        tz: c.tz,
        lang: e.lang,
        type: e.type,
        tier: e.tier,
        feed_kind: e.kind,
        note: e.note ?? '',
        state: e.state,
        headlineAt,
        hash: e.h ?? null,
        ageMin,
        level: headlineAt !== null ? levelFor(ageMin) : 0,
        headline: null,
        homepage: '',
      };
    });
    this.byId = new Map(this.media.map((m) => [m.id, m]));
    if (!previous.size) return [];
    return this.media.filter((m) => m.hash && previous.get(m.id)?.hash !== m.hash);
  }

  get(id: string) {
    return this.byId.get(id);
  }

  /** Make sure titles, links and homepages of these newsroom countries are loaded. */
  async ensureCountries(codes: Iterable<string>): Promise<void> {
    await Promise.all(
      [...new Set(codes)].map(async (cc) => {
        let pending = this.details.get(cc);
        if (!pending) {
          pending = getJSON<CountryFile>(`countries/${cc}.json`).catch(() => null);
          this.details.set(cc, pending);
        }
        const file = await pending;
        if (!file) return;
        for (const [id, d] of Object.entries(file.media)) {
          const m = this.byId.get(id);
          if (!m) continue;
          m.homepage = d.homepage;
          m.note_source = d.note_source;
          m.headline =
            m.headlineAt !== null && d.title && d.url
              ? { title: d.title, url: d.url, published: d.published, first_seen: d.first_seen, translations: d.translations }
              : null;
        }
      }),
    );
  }

  /** The most recent headlines, as media with their headline filled in. */
  async latest(): Promise<Medium[]> {
    const file = await getJSON<LatestFile>('latest.json');
    return file.items.flatMap((item) => {
      const m = this.byId.get(item.id);
      return m ? [{ ...m, headline: { title: item.title, url: item.url ?? '', translations: item.translations } }] : [];
    });
  }
}
