"""Build data/sources.json from the curated seed lists in data/seed/*.csv.

Geocodes city + city_country (falls back to country) against GeoNames
cities15000 (CC BY 4.0); only if that has no match at all, cities500 is tried.
Both are downloaded on first run into data/geonames/. Never guesses: a city
without exactly one match is reported in data/geocode_report.csv and left out
of sources.json. Optional seed columns `lat`/`lon`/`tz` override the lookup,
`id` overrides the slug.

Optional `hint_lat`/`hint_lon` (from Wikidata, written by import_wikidata.py)
resolve problems with evidence instead of guessing:
- several cities with the same name: the one within HINT_RADIUS_KM of the
  documented coordinate, if it is at least twice as close as the next one;
- name unknown to GeoNames (townships, territories such as Puerto Rico): the
  documented coordinate itself, with the time zone of the nearest GeoNames place.

Feed fields (feed, feed_kind, skip_pattern) of existing sources are preserved,
so re-running this script does not undo discover_feeds.py --apply.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import sys
import unicodedata
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT / "data" / "seed"
GEONAMES_DIR = ROOT / "data" / "geonames"
GEONAMES_DATASETS = ("cities15000", "cities500")  # lookup order
SOURCES_FILE = ROOT / "data" / "sources.json"
REPORT_FILE = ROOT / "data" / "geocode_report.csv"

TYPES = {"daily", "weekly", "online", "magazine"}
PRESERVED_FIELDS = ("feed", "feed_format", "feed_kind", "skip_pattern")


# Latin letters that NFKD does not decompose into base letter + diacritic.
TRANSLIT = str.maketrans({"ð": "d", "đ": "dj", "þ": "th", "ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "ł": "l", "ı": "i"})


def fold(text: str) -> str:
    """Casefold and strip diacritics, so 'Chișinău' == 'Chişinău' == 'chisinau'."""
    text = unicodedata.normalize("NFKD", text.casefold().translate(TRANSLIT))
    return "".join(c for c in text if not unicodedata.combining(c)).strip()


def fold_place(text: str) -> str:
    """fold() without punctuation, so 'Washington, D.C.' == 'Washington DC'."""
    return " ".join(re.sub(r"[^\w]+", " ", fold(text)).split())


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", fold(name))


def load_geonames(dataset: str) -> dict[str, list[dict]]:
    """Return the cities of one GeoNames dump, grouped by country code."""
    path = GEONAMES_DIR / f"{dataset}.txt"
    if not path.exists():
        url = f"https://download.geonames.org/export/dump/{dataset}.zip"
        print(f"Downloading {url} …")
        GEONAMES_DIR.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=120) as resp:
            zipfile.ZipFile(io.BytesIO(resp.read())).extractall(GEONAMES_DIR)

    by_country: dict[str, list[dict]] = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            col = line.rstrip("\n").split("\t")
            city = {
                "geonameid": col[0],
                "name": col[1],
                "primary": {fold_place(col[1]), fold_place(col[2])},
                "alternate": {fold_place(a) for a in col[3].split(",") if a},
                "lat": round(float(col[4]), 4),
                "lon": round(float(col[5]), 4),
                "feature": col[7],
                "population": int(col[14] or 0),
                "tz": col[17],
            }
            by_country.setdefault(col[8], []).append(city)
    return by_country


HINT_RADIUS_KM = 40


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def nearest(gazetteers: dict[str, dict[str, list[dict]]], lat: float, lon: float) -> tuple[dict | None, float]:
    best, best_d = None, float("inf")
    for by_country in gazetteers.values():
        for cities in by_country.values():
            for c in cities:
                if abs(c["lat"] - lat) > 1 or abs(c["lon"] - lon) > 1.5:
                    continue  # cheap pre-filter
                d = distance_km(lat, lon, c["lat"], c["lon"])
                if d < best_d:
                    best, best_d = c, d
    return best, best_d


def geocode(
    city: str, country: str, gazetteers: dict[str, dict[str, list[dict]]], hint: tuple[float, float] | None = None
) -> tuple[dict | None, str]:
    """Match on primary names first, then alternate names. Exactly one hit or nothing.

    The next dataset is only consulted if the previous one had no hit at all;
    an ambiguous result stops the search – unless a documented coordinate
    (hint) singles out exactly one of the candidates.
    """
    key = fold_place(city)
    for dataset, by_country in gazetteers.items():
        candidates = by_country.get(country, [])
        for tier in ("primary", "alternate"):
            hits = [c for c in candidates if key in c[tier]]
            if len(hits) == 1:
                return hits[0], f"{dataset}, {tier} name"
            if len(hits) > 1:
                if hint:
                    ranked = sorted(hits, key=lambda h: distance_km(*hint, h["lat"], h["lon"]))
                    d0 = distance_km(*hint, ranked[0]["lat"], ranked[0]["lon"])
                    d1 = distance_km(*hint, ranked[1]["lat"], ranked[1]["lon"])
                    if d0 <= HINT_RADIUS_KM and d1 >= 2 * d0:
                        return ranked[0], f"{dataset}, {tier} name, disambiguated by Wikidata coordinate"
                listed = "; ".join(f"{h['name']} ({h['feature']}, pop {h['population']}, {h['lat']},{h['lon']})" for h in hits)
                return None, f"ambiguous in {dataset} ({tier} name): {listed}"
    if hint:
        place, d = nearest(gazetteers, *hint)
        if place and d <= HINT_RADIUS_KM:
            return (
                {"lat": round(hint[0], 4), "lon": round(hint[1], 4), "tz": place["tz"], "name": city},
                f"not in GeoNames – Wikidata coordinate, time zone of {place['name']} ({d:.0f} km)",
            )
    return None, f"not found in {', '.join(gazetteers)}"


def read_seed() -> list[dict]:
    rows = []
    for path in sorted(SEED_DIR.glob("*.csv")):
        with path.open(encoding="utf-8", newline="") as f:
            for i, row in enumerate(csv.DictReader(f), start=2):
                row = {k: (v or "").strip() for k, v in row.items()}
                row["_origin"] = f"{path.name}:{i}"
                rows.append(row)
    return rows


def main() -> int:
    gazetteers = {name: load_geonames(name) for name in GEONAMES_DATASETS}
    seed = read_seed()
    existing = {}
    if SOURCES_FILE.exists():
        existing = {s["id"]: s for s in json.loads(SOURCES_FILE.read_text(encoding="utf-8"))}

    # Stable ids: an outlet keeps the id it already has in sources.json (matched by name and
    # country) – headline history, status and links depend on it. New outlets get the slug of
    # their name; if that is taken, a country suffix (and a number if still taken).
    known_ids = {(s["name"], s["country"]): s["id"] for s in existing.values()}
    used = set(existing)
    sources, report, problems = [], [], 0

    for row in seed:
        sid = row.get("id") or known_ids.get((row["name"], row["country"]))
        if not sid:
            sid = slugify(row["name"])
            if sid in used:
                sid = f"{sid}-{row['country'].lower()}"
            base, n = sid, 2
            while sid in used:
                sid, n = f"{base}-{n}", n + 1
        used.add(sid)

        errors = []
        if row["type"] not in TYPES:
            errors.append(f"unknown type '{row['type']}'")
        if row["tier"] not in {"1", "2", "3"}:
            errors.append(f"invalid tier '{row['tier']}'")

        if row.get("lat") and row.get("lon"):
            match, how = {"lat": float(row["lat"]), "lon": float(row["lon"]), "tz": row.get("tz", "")}, "seed override"
        else:
            hint = (float(row["hint_lat"]), float(row["hint_lon"])) if row.get("hint_lat") and row.get("hint_lon") else None
            match, how = geocode(row["city"], row.get("city_country") or row["country"], gazetteers, hint)
        if match is None:
            errors.append(how)

        report.append({
            "origin": row["_origin"],
            "id": sid,
            "name": row["name"],
            "country": row["country"],
            "city": row["city"],
            "status": "error" if errors else "ok",
            "match": f"{match.get('name', '')} {match['lat']},{match['lon']}".strip() if match else "",
            "detail": "; ".join(errors) if errors else how,
        })
        if errors:
            problems += 1
            print(f"WARN {row['_origin']} {row['name']} ({row['city']}, {row['country']}): {'; '.join(errors)}", file=sys.stderr)
            continue

        source = {
            "id": sid,
            "name": row["name"],
            "country": row["country"],
            "city": row["city"],
            "city_country": row.get("city_country") or row["country"],
            "lat": match["lat"],
            "lon": match["lon"],
            "tz": match["tz"],
            "lang": row["lang"],
            "type": row["type"],
            "tier": int(row["tier"]),
            "homepage": row["homepage"],
            "feed": "",
            "feed_format": "",
            "feed_kind": "none",
            "note": row.get("note", ""),
            "note_source": row.get("note_source", ""),
        }
        for field in PRESERVED_FIELDS:
            if field in existing.get(sid, {}):
                source[field] = existing[sid][field]
        sources.append(source)

    duplicates = [i for i, n in Counter(s["id"] for s in sources).items() if n > 1]
    if duplicates:
        print(f"ERROR duplicate ids: {duplicates}", file=sys.stderr)
        return 1

    payload = json.dumps(sources, ensure_ascii=False, indent=2) + "\n"
    SOURCES_FILE.parent.mkdir(parents=True, exist_ok=True)
    SOURCES_FILE.write_text(payload, encoding="utf-8")

    with REPORT_FILE.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(report[0].keys()))
        writer.writeheader()
        writer.writerows(report)

    print(f"{len(sources)} sources written, {problems} problem(s) – see {REPORT_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
