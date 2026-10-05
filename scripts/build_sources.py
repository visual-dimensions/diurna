"""Build data/sources.json from the curated seed lists in data/seed/*.csv.

Geocodes city + city_country (falls back to country) against GeoNames
cities15000 (CC BY 4.0); only if that has no match at all, cities500 is tried.
Both are downloaded on first run into data/geonames/. Never guesses: a city
without exactly one match is reported in data/geocode_report.csv and left out
of sources.json. Optional seed columns `lat`/`lon`/`tz` override the lookup,
`id` overrides the slug.

Feed fields (feed, feed_kind, skip_pattern) of existing sources are preserved,
so re-running this script does not undo discover_feeds.py --apply.
"""

from __future__ import annotations

import csv
import io
import json
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
                "primary": {fold(col[1]), fold(col[2])},
                "alternate": {fold(a) for a in col[3].split(",") if a},
                "lat": round(float(col[4]), 4),
                "lon": round(float(col[5]), 4),
                "feature": col[7],
                "population": int(col[14] or 0),
                "tz": col[17],
            }
            by_country.setdefault(col[8], []).append(city)
    return by_country


def geocode(city: str, country: str, gazetteers: dict[str, dict[str, list[dict]]]) -> tuple[dict | None, str]:
    """Match on primary names first, then alternate names. Exactly one hit or nothing.

    The next dataset is only consulted if the previous one had no hit at all;
    an ambiguous result stops the search.
    """
    key = fold(city)
    for dataset, by_country in gazetteers.items():
        candidates = by_country.get(country, [])
        for tier in ("primary", "alternate"):
            hits = [c for c in candidates if key in c[tier]]
            if len(hits) == 1:
                return hits[0], f"{dataset}, {tier} name"
            if len(hits) > 1:
                listed = "; ".join(f"{h['name']} ({h['feature']}, pop {h['population']}, {h['lat']},{h['lon']})" for h in hits)
                return None, f"ambiguous in {dataset} ({tier} name): {listed}"
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

    # Stable ids: slug of the name; on collision, every colliding entry gets a country suffix.
    slugs = Counter(slugify(r["name"]) for r in seed if not r.get("id"))
    sources, report, problems = [], [], 0

    for row in seed:
        sid = row.get("id") or slugify(row["name"])
        if not row.get("id") and slugs[sid] > 1:
            sid = f"{sid}-{row['country'].lower()}"

        errors = []
        if row["type"] not in TYPES:
            errors.append(f"unknown type '{row['type']}'")
        if row["tier"] not in {"1", "2", "3"}:
            errors.append(f"invalid tier '{row['tier']}'")

        if row.get("lat") and row.get("lon"):
            match, how = {"lat": float(row["lat"]), "lon": float(row["lon"]), "tz": row.get("tz", "")}, "seed override"
        else:
            match, how = geocode(row["city"], row.get("city_country") or row["country"], gazetteers)
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
