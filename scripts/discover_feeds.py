"""Discover RSS/Atom feeds for every source in data/sources.json.

    discover_feeds.py            write data/discovery_report.csv for manual review
    discover_feeds.py --only a,b limit discovery to these source ids (report is merged)
    discover_feeds.py --apply    copy chosen_feed/feed_kind from the (reviewed,
                                 possibly hand-edited) report into sources.json

Discovery per source (CLAUDE.md, section 6):
1. Load the homepage, collect <link rel="alternate" type="application/(rss|atom)+xml">.
2. If none of them is a valid feed, try the fallback paths plus any homepage
   link labelled RSS/Feed. Those that answer with HTML are treated as RSS
   overview pages: their feed links are collected and checked as well.
3. A feed is valid if it has at least one item with title and link.
4. Rank: feeds whose URL or title matches TOP_PATTERN -> "top", otherwise the
   most general feed -> "latest". Feeds not known to be stale (newest dated
   item < 48 h, or undated) win over stale ones, shallow URL paths over deep
   ones, earlier links over later ones.
"""

from __future__ import annotations

import argparse
import asyncio
import calendar
import csv
import html
import json
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import feedparser
import httpx
from selectolax.lexbor import LexborHTMLParser

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "data" / "sources.json"
PUBLIC_SOURCES_FILE = ROOT / "public" / "data" / "sources.json"
REPORT_FILE = ROOT / "data" / "discovery_report.csv"

USER_AGENT = "Diurna/0.1 (+https://github.com/visual-dimensions/diurna; feed discovery)"
TIMEOUT = 15.0
CONCURRENCY = 8
MAX_CANDIDATES = 20
MAX_OVERVIEW_PAGES = 3
STALE_HOURS = 48
FALLBACK_PATHS = ("/rss", "/feed", "/rss.xml", "/feed.xml", "/index.rss")
FEED_TYPE = re.compile(r"application/(rss|atom)\+xml", re.I)

# Tokens from the brief, plus a few direct equivalents in further languages
# (top news / front page / home page). Tokens must start at a non-letter
# boundary; "une" must also end at one (so "À la une" matches, "tribune" not).
LETTER = r"[^\W\d_]"
TOP_PATTERN = re.compile(
    rf"(?<!{LETTER})(?:une(?!{LETTER})|portada|frontpage|front-page|topstories|top-stories|home"
    rf"|startseite|titelseite|hauptnachrichten|главное|prima"
    rf"|topnews|top-news|topthemen|voorpagina|forside|etusivu|anasayfa|naslovnica|copertina)",
    re.I,
)
# Links on a page that look like a feed or an RSS overview page.
FEEDISH_HREF = re.compile(r"rss|atom|feed|\.xml(\?|$)", re.I)
OVERVIEW_LINK = re.compile(r"(?<![a-z])(rss|feeds?)(?![a-z])", re.I)
COMMENTS_PATTERN = re.compile(r"comments?(/|\.|$)|commentaires", re.I)

REPORT_FIELDS = [
    "id", "name", "country", "homepage", "homepage_status", "candidates",
    "chosen_feed", "feed_kind", "chosen_via", "reason", "first_item_age_h", "newest_item_age_h", "sample_title",
]


@dataclass
class Candidate:
    url: str
    title: str = ""
    order: int = 0
    valid: bool = False
    status: str = ""
    feed_title: str = ""
    items: int = 0
    first_title: str = ""
    first_age_h: float | None = None
    newest_age_h: float | None = None
    via: str = "homepage"  # homepage <link> | fallback | overview page
    page: str = ""  # HTML body, if the URL answered with a web page instead of a feed

    @property
    def is_top(self) -> bool:
        return bool(TOP_PATTERN.search(self.url) or TOP_PATTERN.search(self.title) or TOP_PATTERN.search(self.feed_title))

    @property
    def is_stale(self) -> bool:
        return self.newest_age_h is not None and self.newest_age_h >= STALE_HOURS

    @property
    def depth(self) -> int:
        parts = urlsplit(self.url)
        return len([p for p in parts.path.split("/") if p]) + (1 if parts.query else 0)

    def summary(self) -> str:
        if not self.valid:
            return f"{self.url} [{self.status}]"
        age = f"{self.newest_age_h:.0f}h" if self.newest_age_h is not None else "?"
        kind = "top" if self.is_top else "gen"
        return f"{self.url} [{kind}, {self.via}, {self.items} items, newest {age}]"


@dataclass
class Result:
    source: dict
    homepage_status: str = ""
    candidates: list[Candidate] = field(default_factory=list)
    chosen: Candidate | None = None
    feed_kind: str = "none"
    reason: str = ""


def clean_title(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def age_hours(struct) -> float | None:
    if not struct:
        return None
    return max(0.0, (time.time() - calendar.timegm(struct)) / 3600)  # feedparser structs are UTC


def entry_age(entry) -> float | None:
    return age_hours(entry.get("published_parsed") or entry.get("updated_parsed"))


async def check_feed(client: httpx.AsyncClient, cand: Candidate) -> None:
    try:
        resp = await client.get(cand.url)
    except httpx.HTTPError as exc:
        cand.status = type(exc).__name__
        return
    cand.status = str(resp.status_code)
    if resp.status_code != 200:
        return
    content_type = resp.headers.get("content-type", "")
    parsed = feedparser.parse(resp.content, response_headers={"content-type": content_type})
    entries = [e for e in parsed.entries if e.get("title") and e.get("link")]
    if not entries:
        if "html" in content_type.lower():
            cand.status, cand.page = "html page", resp.text
        else:
            cand.status = "no items"
        return
    cand.valid = True
    cand.feed_title = clean_title(parsed.feed.get("title", ""))
    cand.items = len(entries)
    cand.first_title = clean_title(entries[0].title)
    cand.first_age_h = entry_age(entries[0])
    ages = [a for a in (entry_age(e) for e in entries) if a is not None]
    cand.newest_age_h = min(ages) if ages else None


def site_of(url: str) -> str:
    host = urlsplit(url).hostname or ""
    return host.removeprefix("www.")


def same_site(a: str, b: str) -> bool:
    ha, hb = site_of(a), site_of(b)
    return ha == hb or ha.endswith("." + hb) or hb.endswith("." + ha)


def collect_alternates(page: str, base_url: str, order_offset: int = 0) -> list[Candidate]:
    tree = LexborHTMLParser(page)
    found: dict[str, Candidate] = {}
    for node in tree.css("link[rel]"):
        rel = (node.attributes.get("rel") or "").lower().split()
        if "alternate" not in rel or not FEED_TYPE.search(node.attributes.get("type") or ""):
            continue
        href = (node.attributes.get("href") or "").strip()
        if not href:
            continue
        url = urljoin(base_url, href)
        if url not in found:
            found[url] = Candidate(url=url, title=clean_title(node.attributes.get("title") or ""), order=order_offset + len(found))
    return list(found.values())[:MAX_CANDIDATES]


def collect_anchors(page: str, base_url: str, pattern: re.Pattern, *, on_text: bool, same_site_only: bool) -> list[tuple[str, str]]:
    """(url, text) of <a> links whose href (or, if on_text, link text) matches pattern."""
    links: dict[str, str] = {}
    for node in LexborHTMLParser(page).css("a[href]"):
        href = (node.attributes.get("href") or "").strip()
        if not href or href.startswith(("#", "mailto:", "javascript:", "tel:")):
            continue
        text = clean_title(node.text())
        if not (pattern.search(href) or (on_text and pattern.search(text))):
            continue
        url = urljoin(base_url, href).split("#")[0]
        if not url.startswith("http") or (same_site_only and not same_site(url, base_url)):
            continue
        links.setdefault(url, text)
    return list(links.items())


def feed_links_from_overview(page: str, base_url: str, order_offset: int) -> list[Candidate]:
    """Feed candidates on an RSS overview page; top-pattern links first, then shallow ones."""
    found = {c.url: c for c in collect_alternates(page, base_url, order_offset)}
    for url, text in collect_anchors(page, base_url, FEEDISH_HREF, on_text=False, same_site_only=False):
        if url != base_url and url not in found:
            found[url] = Candidate(url=url, title=text, order=order_offset + len(found), via="overview page")
    ranked = sorted(found.values(), key=lambda c: (not c.is_top, c.depth, c.order))
    return ranked[:MAX_CANDIDATES]


def choose(result: Result) -> None:
    valid = [c for c in result.candidates if c.valid and not COMMENTS_PATTERN.search(c.url + " " + c.title)]
    if not valid:
        result.reason = result.reason or "no valid feed found"
        return
    top = [c for c in valid if c.is_top]
    pool, kind = (top, "top") if top else (valid, "latest")
    pool.sort(key=lambda c: (c.is_stale, c.depth, c.order))
    result.chosen, result.feed_kind = pool[0], kind

    why = [f"{len(valid)} valid feed(s)"]
    if kind == "top":
        match = TOP_PATTERN.search(result.chosen.url) or TOP_PATTERN.search(result.chosen.title) or TOP_PATTERN.search(result.chosen.feed_title)
        why.append(f"top pattern '{match.group(0)}'")
    else:
        why.append("no top pattern; most general feed")
    if result.chosen.via == "overview page":
        why.append("CHECK picked from RSS overview page, may be a section feed")
    if result.chosen.is_stale:
        why.append(f"WARNING newest item older than {STALE_HOURS}h")
    elif result.chosen.newest_age_h is None:
        why.append("items carry no date")
    result.reason = "; ".join(why)


async def discover(client: httpx.AsyncClient, sem: asyncio.Semaphore, source: dict) -> Result:
    result = Result(source=source)
    async with sem:
        base_url, homepage_html = source["homepage"], ""
        try:
            resp = await client.get(source["homepage"])
            result.homepage_status = str(resp.status_code)
            base_url = str(resp.url)
            if resp.status_code == 200:
                homepage_html = resp.text
                result.candidates = collect_alternates(homepage_html, base_url)
            else:
                result.reason = f"homepage HTTP {resp.status_code}"
        except httpx.HTTPError as exc:
            result.homepage_status = type(exc).__name__
            result.reason = f"homepage {type(exc).__name__}"

        await asyncio.gather(*(check_feed(client, c) for c in result.candidates))

        if not any(c.valid for c in result.candidates):
            origins = dict.fromkeys(f"{urlsplit(u).scheme}://{urlsplit(u).netloc}" for u in (base_url, source["homepage"]))
            urls = [origin + path for origin in origins for path in FALLBACK_PATHS]
            if homepage_html:
                anchors = collect_anchors(homepage_html, base_url, OVERVIEW_LINK, on_text=True, same_site_only=True)
                urls += [url for url, _ in anchors]
            known = {c.url for c in result.candidates}
            extra = [Candidate(url=u, order=100 + i, via="fallback") for i, u in enumerate(dict.fromkeys(urls)) if u not in known]
            await asyncio.gather(*(check_feed(client, c) for c in extra))
            result.candidates += extra

            # Answers that are web pages are probably RSS overview pages.
            overview = [c for c in extra if c.page][:MAX_OVERVIEW_PAGES]
            known = {c.url for c in result.candidates}
            harvested: dict[str, Candidate] = {}
            for i, page in enumerate(overview):
                for c in feed_links_from_overview(page.page, page.url, order_offset=200 + 100 * i):
                    if c.url not in known and c.url not in harvested:
                        c.via = "overview page"
                        harvested[c.url] = c
            found = list(harvested.values())[:MAX_CANDIDATES]
            await asyncio.gather(*(check_feed(client, c) for c in found))
            result.candidates += found
            for c in result.candidates:
                c.page = ""

    choose(result)
    mark = {"top": "TOP   ", "latest": "LATEST", "none": "NONE  "}[result.feed_kind]
    print(f"{mark} {source['id']:<32} {result.chosen.url if result.chosen else result.reason}", flush=True)
    return result


def to_row(r: Result) -> dict:
    c = r.chosen
    fmt = lambda v: f"{v:.1f}" if v is not None else ""  # noqa: E731
    return {
        "id": r.source["id"],
        "name": r.source["name"],
        "country": r.source["country"],
        "homepage": r.source["homepage"],
        "homepage_status": r.homepage_status,
        "candidates": " | ".join(x.summary() for x in r.candidates),
        "chosen_feed": c.url if c else "",
        "feed_kind": r.feed_kind,
        "chosen_via": c.via if c else "",
        "reason": r.reason,
        "first_item_age_h": fmt(c.first_age_h) if c else "",
        "newest_item_age_h": fmt(c.newest_age_h) if c else "",
        "sample_title": c.first_title if c else "",
    }


def read_report() -> dict[str, dict]:
    if not REPORT_FILE.exists():
        return {}
    with REPORT_FILE.open(encoding="utf-8", newline="") as f:
        return {row["id"]: row for row in csv.DictReader(f)}


async def run_discovery(sources: list[dict], only: set[str] | None) -> None:
    targets = [s for s in sources if not only or s["id"] in only]
    sem = asyncio.Semaphore(CONCURRENCY)
    limits = httpx.Limits(max_connections=CONCURRENCY * 4)
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8"}
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers=headers, limits=limits) as client:
        results = await asyncio.gather(*(discover(client, sem, s) for s in targets))

    rows = read_report() if only else {}
    rows.update({r.source["id"]: to_row(r) for r in results})
    ordered = [rows[s["id"]] for s in sources if s["id"] in rows]
    with REPORT_FILE.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=REPORT_FIELDS)
        writer.writeheader()
        writer.writerows(ordered)

    kinds = [row["feed_kind"] for row in ordered]
    print(f"\n{len(ordered)} sources: top {kinds.count('top')}, latest {kinds.count('latest')}, none {kinds.count('none')}")
    print(f"Report: {REPORT_FILE.relative_to(ROOT)} – review it, then run with --apply.")


def apply_report(sources: list[dict]) -> int:
    rows = read_report()
    if not rows:
        print(f"No report at {REPORT_FILE}", file=sys.stderr)
        return 1
    changed = 0
    for s in sources:
        row = rows.get(s["id"])
        if row is None:
            continue
        kind = row["feed_kind"].strip() or "none"
        feed = row["chosen_feed"].strip() if kind != "none" else ""
        if kind not in {"top", "latest", "none"} or (kind != "none" and not feed):
            print(f"WARN {s['id']}: invalid feed_kind/chosen_feed in report, skipped", file=sys.stderr)
            continue
        if (s.get("feed"), s.get("feed_kind")) != (feed, kind):
            s["feed"], s["feed_kind"] = feed, kind
            changed += 1
    payload = json.dumps(sources, ensure_ascii=False, indent=2) + "\n"
    for path in (SOURCES_FILE, PUBLIC_SOURCES_FILE):
        path.write_text(payload, encoding="utf-8")
    print(f"{changed} source(s) updated in {SOURCES_FILE.relative_to(ROOT)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write the reviewed report into sources.json")
    parser.add_argument("--only", help="comma-separated source ids")
    args = parser.parse_args()

    sources = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    if args.apply:
        return apply_report(sources)
    only = set(args.only.split(",")) if args.only else None
    asyncio.run(run_discovery(sources, only))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
