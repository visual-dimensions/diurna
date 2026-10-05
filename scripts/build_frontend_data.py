"""Split the pipeline output into the files the frontend loads.

Inputs:  data/sources.json, public/data/headlines.json, public/data/status.json
Outputs (public/data/):
  index.json            everything the globe, search and filters need – no titles.
                        Compact: cities listed once, times as Unix minutes, short
                        hashes, default values omitted. Budget: < 100 KB gzip.
  countries/<CC>.json   details per newsroom country (title, url, translations,
                        homepage, evidence links) – loaded when a city opens.
  latest.json           the most recent headlines for the live bar and ambient mode.

Visibility rules live here, once: a headline is shown unless the source's
state is stale, dead or no_feed (CLAUDE.md, principle 4).
"""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "data" / "sources.json"
DATA_DIR = ROOT / "public" / "data"
HEADLINES_FILE = DATA_DIR / "headlines.json"
STATUS_FILE = DATA_DIR / "status.json"
COUNTRIES_DIR = DATA_DIR / "countries"

HIDDEN_STATES = {"stale", "dead", "no_feed"}
LATEST_COUNT = 40


def load(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def minutes(iso: str | None) -> int | None:
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() // 60) if iso else None


def short_hash(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()[:8]


def main() -> int:
    sources = load(SOURCES_FILE, [])
    headlines = load(HEADLINES_FILE, {"generated_at": None, "items": {}})
    status = load(STATUS_FILE, {})
    generated_at = headlines.get("generated_at")

    index, cities, city_index, countries, latest = [], [], {}, {}, []
    for s in sources:
        key = f"{s['city']}|{s['city_country']}"
        if key not in city_index:
            city_index[key] = len(cities)
            cities.append({"name": s["city"], "cc": s["city_country"], "lat": s["lat"], "lon": s["lon"], "tz": s["tz"]})

        state = status.get(s["id"], {}).get("state", "no_feed")
        item = headlines["items"].get(s["id"])
        visible = item if item and state not in HIDDEN_STATES else None
        when = (visible.get("published") or visible.get("first_seen")) if visible else None

        entry = {
            "id": s["id"],
            "name": s["name"],
            "c": city_index[key],
            "lang": s["lang"],
            "type": s["type"],
            "tier": s["tier"],
            "kind": s["feed_kind"],
            "state": state,
        }
        if s["country"] != s["city_country"]:
            entry["country"] = s["country"]  # exile media: country of origin differs from the newsroom's
        if s.get("note"):
            entry["note"] = s["note"]
        if visible:
            entry["t"] = minutes(when)  # headline time, drives freshness; absent = no current headline
            entry["h"] = short_hash(visible["url"])  # changes with the headline – lets the frontend spot new ones
        index.append(entry)

        detail = {"homepage": s["homepage"]}
        if s.get("note_source"):
            detail["note_source"] = s["note_source"]
        if visible:
            detail.update({k: visible[k] for k in ("title", "url", "published", "first_seen") if visible.get(k)})
            if visible.get("translations"):
                detail["translations"] = visible["translations"]
            latest.append({"id": s["id"], "t": when, "title": visible["title"], **(
                {"translations": visible["translations"]} if visible.get("translations") else {}
            )})
        countries.setdefault(s["city_country"], {})[s["id"]] = detail

    latest.sort(key=lambda x: x["t"] or "", reverse=True)

    write(DATA_DIR / "index.json", {"generated_at": generated_at, "cities": cities, "media": index})
    write(DATA_DIR / "latest.json", {"generated_at": generated_at, "items": latest[:LATEST_COUNT]})
    if COUNTRIES_DIR.exists():
        shutil.rmtree(COUNTRIES_DIR)  # countries can disappear from the seed list
    for cc, media in countries.items():
        write(COUNTRIES_DIR / f"{cc}.json", {"generated_at": generated_at, "media": media})

    size = (DATA_DIR / "index.json").stat().st_size
    print(f"frontend data: {len(index)} media, {len(countries)} countries, index {size / 1024:.1f} KB raw")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
