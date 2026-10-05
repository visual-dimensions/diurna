"""Propose candidate media for a country from Wikidata (CC0).

    import_wikidata.py AT US NZ        write data/seed/candidates/<CC>.csv for review
    import_wikidata.py --accept AT     copy rows marked include=yes into data/seed/at.csv

Nothing goes into sources.json directly: the candidate file is reviewed by a
human (CLAUDE.md, section 10, step B), then accepted into a seed file, then
build_sources.py and discover_feeds.py run as usual.

Per candidate: name and city in the outlet's own language, homepage, language,
type, a tier suggestion (from the number of Wikipedia language versions, a
rough proxy for prominence) and – if Wikidata records a government or
state-owned owner – a pre-filled `state` note with the Wikidata item as
evidence. The country quota (max(3, min(300, 10·√population in millions)))
decides how many of the best-known candidates are pre-marked include=yes.
Outlets already in a seed file (same homepage domain) are marked `seeded`.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from collections import Counter
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT / "data" / "seed"
CANDIDATES_DIR = SEED_DIR / "candidates"

USER_AGENT = "Diurna/0.1 (+https://github.com/visual-dimensions/diurna; candidate import)"
SPARQL = "https://query.wikidata.org/sparql"
API = "https://www.wikidata.org/w/api.php"

# Root classes; all their subclasses count too (tabloid, regional newspaper, …).
ROOT_CLASSES = {
    "Q11032": "daily",  # newspaper (frequency unknown → daily, reviewer adjusts)
    "Q1153191": "online",  # online newspaper
    "Q17232649": "online",  # news website
    "Q1684600": "magazine",  # news magazine
}
TYPE_OVERRIDES = {"Q1110794": "daily", "Q2305295": "weekly"}  # daily / weekly newspaper
# Classes that are not news media for us, with all their subclasses (e.g. municipal gazettes).
# An item is kept if it also has another, regular class (Rossiyskaya Gazeta is also a daily newspaper).
# government gazette, social news website, news aggregator, news aggregation website (Reddit)
EXCLUDED_ROOTS = ["Q2065227", "Q3963243", "Q498267", "Q28933155"]
STATE_OWNER_CLASSES = {"Q7188", "Q327333", "Q2659904", "Q270791"}  # government, agency, organization, state-owned enterprise
TIER_BY_SITELINKS = ((15, 1), (6, 2), (0, 3))

SEED_FIELDS = ["country", "name", "city", "city_country", "homepage", "lang", "type", "tier", "note", "note_source"]
REVIEW_FIELDS = ["include", *SEED_FIELDS, "qid", "sitelinks", "wd_lat", "wd_lon", "remark"]


def http_json(url: str, params: dict, retries: int = 3) -> dict:
    full = f"{url}?{urllib.parse.urlencode(params)}"
    for attempt in range(retries):
        req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json, application/json"})
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read())
        except Exception as exc:  # timeouts and 429/5xx from the public endpoints
            if attempt == retries - 1:
                raise
            print(f"  retry after {type(exc).__name__}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("unreachable")


def sparql(query: str) -> list[dict]:
    rows = http_json(SPARQL, {"query": query, "format": "json"})["results"]["bindings"]
    return [{k: v["value"] for k, v in row.items()} for row in rows]


def qid(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def class_closure() -> dict[str, str]:
    """All subclasses of the root classes → our type; excluded classes → ""."""
    values = " ".join(f"wd:{q}" for q in ROOT_CLASSES)
    rows = sparql(f"SELECT ?c ?root WHERE {{ VALUES ?root {{ {values} }} ?c wdt:P279* ?root . }}")
    closure: dict[str, str] = {}
    for r in rows:
        closure.setdefault(qid(r["c"]), ROOT_CLASSES[qid(r["root"])])
    closure.update(TYPE_OVERRIDES)
    excluded = " ".join(f"wd:{q}" for q in EXCLUDED_ROOTS)
    for r in sparql(f"SELECT ?c WHERE {{ VALUES ?root {{ {excluded} }} ?c wdt:P279* ?root . }}"):
        closure[qid(r["c"])] = ""
    return closure


def country_info(cc: str) -> dict:
    rows = sparql(f"""
      SELECT ?country ?pop ?langCode WHERE {{
        ?country wdt:P297 "{cc}" .
        OPTIONAL {{ ?country wdt:P1082 ?pop . }}
        OPTIONAL {{ ?country wdt:P37 ?lang . ?lang wdt:P218 ?langCode . }}
      }}""")
    if not rows:
        raise SystemExit(f"unknown country code {cc}")
    pops = [float(r["pop"]) for r in rows if r.get("pop")]
    return {
        "qid": qid(rows[0]["country"]),
        "population": max(pops) if pops else 0.0,
        "langs": list(dict.fromkeys(r["langCode"] for r in rows if r.get("langCode"))),
    }


def quota(population: float) -> int:
    return max(3, min(300, round(10 * math.sqrt(population / 1e6))))


def candidates(country_qid: str, closure: dict[str, str]) -> list[dict]:
    """Outlets of a country: SPARQL only finds the IDs (fast); details come from the API."""
    # Resolving the subclasses inside the query is fast; a VALUES list of ~250 classes times out.
    # Large countries (thousands of local papers) need small queries: one per root class and
    # country property (P17 country, P495 country of origin – Wikidata uses either).
    rows = []
    for root in ROOT_CLASSES:
        for prop in ("P17", "P495"):
            rows += sparql(f"""
              SELECT DISTINCT ?item ?type WHERE {{
                ?type wdt:P279* wd:{root} .
                ?item wdt:P31 ?type ;
                      wdt:{prop} wd:{country_qid} ;
                      wdt:P856 [] .
              }}""")
    found: dict[str, dict] = {}
    for r in rows:
        it = found.setdefault(qid(r["item"]), {"qid": qid(r["item"]), "types": set()})
        it["types"].add(closure.get(qid(r["type"]), "daily"))
    found = {q: it for q, it in found.items() if it["types"] - {""}}  # only excluded classes → drop
    for it in found.values():
        it["types"].discard("")

    ents = entities(sorted(found), "claims|sitelinks")
    for q, it in found.items():
        it["sitelinks"] = len((ents.get(q) or {}).get("sitelinks", {}))
    lang_ids = sorted({l for e in ents.values() for l in claim_ids(e, "P407")})
    lang_codes = {lid: _string_claim(e, "P218") for lid, e in entities(lang_ids, "claims").items()}

    items = []
    for q, it in found.items():
        ent = ents.get(q)
        if _has(ent, "P576") or _has(ent, "P2669"):
            continue  # dissolved / discontinued
        sites = _string_claims(ent, "P856")
        if not sites:
            continue  # no homepage → nothing to fetch
        place = (claim_ids(ent, "P291") or claim_ids(ent, "P159") or [None])[0]
        it.update({
            "sites": sites,
            "langs": [c for c in (lang_codes.get(l) for l in claim_ids(ent, "P407")) if c],
            "owners": set(claim_ids(ent, "P127")),
            "place": place,
        })
        items.append(it)
    return items


def _has(entity: dict | None, prop: str) -> bool:
    return bool((entity or {}).get("claims", {}).get(prop))


def _string_claims(entity: dict | None, prop: str) -> list[str]:
    return [
        c["mainsnak"]["datavalue"]["value"]
        for c in (entity or {}).get("claims", {}).get(prop, [])
        if c["mainsnak"].get("datavalue") and isinstance(c["mainsnak"]["datavalue"]["value"], str)
    ]


def _string_claim(entity: dict | None, prop: str) -> str:
    values = _string_claims(entity, prop)
    return values[0] if values else ""


def entities(ids: list[str], props: str = "labels|claims") -> dict[str, dict]:
    out: dict[str, dict] = {}
    for i in range(0, len(ids), 50):
        chunk = ids[i : i + 50]
        data = http_json(API, {"action": "wbgetentities", "ids": "|".join(chunk), "props": props, "format": "json"})
        out.update(data.get("entities", {}))
    return out


def label(entity: dict | None, langs: list[str]) -> str:
    labels = (entity or {}).get("labels", {})
    for lang in [*langs, "mul", "en"]:
        if lang in labels:
            return labels[lang]["value"]
    return next(iter(labels.values()))["value"] if labels else ""


def claim_ids(entity: dict | None, prop: str) -> list[str]:
    return [
        c["mainsnak"]["datavalue"]["value"]["id"]
        for c in (entity or {}).get("claims", {}).get(prop, [])
        if c["mainsnak"].get("datavalue")
    ]


def domain(url: str) -> str:
    host = urllib.parse.urlsplit(url if "://" in url else f"http://{url}").hostname or ""
    return re.sub(r"^(www\d?|m)\.", "", host.lower())


def seeded_domains() -> set[str]:
    found = set()
    for path in SEED_DIR.glob("*.csv"):
        with path.open(encoding="utf-8", newline="") as f:
            found.update(domain(r["homepage"]) for r in csv.DictReader(f) if r.get("homepage"))
    return found


def build(cc: str, closure: dict[str, str]) -> Path:
    info = country_info(cc)
    limit = quota(info["population"])
    items = candidates(info["qid"], closure)
    print(f"{cc}: {len(items)} candidates, population {info['population'] / 1e6:.1f} M → quota {limit}")

    # Labels for outlets, places and owners; countries of the places (exile / foreign newsrooms).
    places = sorted({it["place"] for it in items if it.get("place")})
    owners = sorted({o for it in items for o in it["owners"]})
    ents = entities(sorted({it["qid"] for it in items} | set(places) | set(owners)))
    place_countries = {p: claim_ids(ents.get(p), "P17") for p in places}
    country_ids = sorted({c for cs in place_countries.values() for c in cs})
    iso = {}
    for cid, ent in entities(country_ids, "claims").items():
        codes = [c["mainsnak"]["datavalue"]["value"] for c in ent.get("claims", {}).get("P297", []) if c["mainsnak"].get("datavalue")]
        if codes:
            iso[cid] = codes[0]

    # Outlets list several languages, some none at all. Prefer the language most common among
    # the country's outlets (Wikidata's official-language list misleads – for the US it starts
    # with Spanish); fall back to the first official language.
    frequency = Counter(l for it in items for l in it["langs"])
    def rank(lang: str) -> int:
        return -frequency[lang]
    default_lang = [frequency.most_common(1)[0][0]] if frequency else info["langs"][:1]

    seeded = seeded_domains()
    rows, seen_domains = [], set()
    for it in sorted(items, key=lambda x: -x["sitelinks"]):
        site = it["sites"][0]
        dom = domain(site)
        if dom in seen_domains:
            continue  # same outlet listed twice in Wikidata
        seen_domains.add(dom)
        langs = sorted(it["langs"], key=rank) or default_lang
        lang = langs[0] if langs else ""
        place = it.get("place")
        city_cc = next((iso[c] for c in place_countries.get(place, []) if c in iso), cc) if place else cc
        state_owners = [o for o in it["owners"] if set(claim_ids(ents.get(o), "P31")) & STATE_OWNER_CLASSES]
        lat = lon = ""
        coords = [c["mainsnak"]["datavalue"]["value"] for c in (ents.get(place) or {}).get("claims", {}).get("P625", []) if c["mainsnak"].get("datavalue")]
        if coords:
            lat, lon = f"{coords[0]['latitude']:.4f}", f"{coords[0]['longitude']:.4f}"
        remarks = []
        if not place:
            remarks.append("no place of publication/headquarters in Wikidata – fill in city")
        if not it["langs"]:
            remarks.append("language from country default")
        if len(it["types"]) > 1:
            remarks.append(f"types: {', '.join(sorted(it['types']))}")
        if state_owners:
            remarks.append(f"owner: {', '.join(label(ents.get(o), ['en']) for o in state_owners)}")
        if city_cc != cc:
            remarks.append(f"newsroom abroad ({city_cc}) – exile?")
        tier = next(t for threshold, t in TIER_BY_SITELINKS if it["sitelinks"] >= threshold)
        types = it["types"] - {"daily"} or {"daily"}
        rows.append({
            "include": "seeded" if dom in seeded else "",
            "country": cc,
            "name": label(ents.get(it["qid"]), langs),
            "city": label(ents.get(place), langs) if place else "",
            "city_country": city_cc if city_cc != cc else "",
            "homepage": site,
            "lang": lang,
            "type": sorted(types)[0],
            "tier": tier,
            "note": "state" if state_owners else ("exile" if city_cc != cc else ""),
            "note_source": f"https://www.wikidata.org/wiki/{it['qid']}" if state_owners else "",
            "qid": it["qid"],
            "sitelinks": it["sitelinks"],
            "wd_lat": lat,
            "wd_lon": lon,
            "remark": "; ".join(remarks),
        })

    # Pre-select the best-known outlets up to the quota (already seeded ones count towards it).
    taken = sum(r["include"] == "seeded" for r in rows)
    for r in rows:
        if r["include"] == "" and taken < limit and r["city"]:
            r["include"] = "yes"
            taken += 1
        elif r["include"] == "":
            r["include"] = "no"

    CANDIDATES_DIR.mkdir(parents=True, exist_ok=True)
    path = CANDIDATES_DIR / f"{cc}.csv"
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=REVIEW_FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    counts = {k: sum(r["include"] == k for r in rows) for k in ("yes", "no", "seeded")}
    print(f"  → {path.relative_to(ROOT)}: {counts}")
    return path


def accept(cc: str) -> int:
    src = CANDIDATES_DIR / f"{cc}.csv"
    if not src.exists():
        print(f"no candidate file {src}", file=sys.stderr)
        return 1
    with src.open(encoding="utf-8", newline="") as f:
        chosen = [r for r in csv.DictReader(f) if r["include"].strip().lower() == "yes"]
    target = SEED_DIR / f"{cc.lower()}.csv"
    existing = []
    if target.exists():
        with target.open(encoding="utf-8", newline="") as f:
            existing = list(csv.DictReader(f))
    known = {domain(r["homepage"]) for r in existing}
    new = [{k: r.get(k, "") for k in SEED_FIELDS} for r in chosen if domain(r["homepage"]) not in known]
    with target.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=SEED_FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(existing + new)
    print(f"{len(new)} outlet(s) added to {target.relative_to(ROOT)} – next: build_sources.py, discover_feeds.py --only …")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("countries", nargs="+", help="ISO 3166-1 alpha-2 codes, e.g. AT US NZ")
    parser.add_argument("--accept", action="store_true", help="copy include=yes rows into data/seed/<cc>.csv")
    args = parser.parse_args()
    codes = [c.upper() for c in args.countries]
    if args.accept:
        return max(accept(cc) for cc in codes)
    closure = class_closure()
    print(f"{len(closure)} Wikidata classes count as news media")
    failed = []
    for cc in codes:
        try:
            build(cc, closure)
        except Exception as exc:  # one country failing (endpoint timeout) should not stop the others
            print(f"{cc}: failed ({type(exc).__name__}: {exc}) – try again later", file=sys.stderr)
            failed.append(cc)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
