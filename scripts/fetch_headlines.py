"""Fetch the current headline of every source in data/sources.json.

Writes public/data/headlines.json and public/data/status.json (only if their
content changed) and remembers ETag/Last-Modified in data/http_cache.json.

Rules (CLAUDE.md, section 6):
- async, max. 10 parallel requests, timeout 10 s, 1 retry (network errors, 429, 5xx)
- conditional GET; 304 counts as success and keeps the previous headline
- headline = first item (news sitemaps: newest item, see feeds.py), skipping
  items whose title matches the source's optional `skip_pattern`
- no success -> keep the old headline, increase fail_streak
- state: no_feed | dead (>= 10 failures) | failing (>= 3) | stale (> 48 h) | ok

Items without a date, or dated more than 15 min in the future (wrong time
zone), get `published: null`; their age is then measured from `first_seen`,
the first run that saw this headline.

Staleness is measured by `feed_updated` (newest dated item in the feed), not
by the headline itself: a front-page feed may lead with an older story while
the feed is perfectly alive.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin

import httpx

from feeds import Item, parse

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "data" / "sources.json"
CACHE_FILE = ROOT / "data" / "http_cache.json"
HEADLINES_FILE = ROOT / "public" / "data" / "headlines.json"
STATUS_FILE = ROOT / "public" / "data" / "status.json"

USER_AGENT = "Diurna/0.1 (+https://github.com/visual-dimensions/diurna; headline fetcher)"
CONCURRENCY = 10
TIMEOUT = 10.0
RETRY_DELAY = 2.0
STALE_AFTER = timedelta(hours=48)
FAILING_AFTER = 3
DEAD_AFTER = 10
RETRY_STATUS = {429, 500, 502, 503, 504}
FUTURE_TOLERANCE = timedelta(minutes=15)


@dataclass
class Outcome:
    http: int | None = None
    not_modified: bool = False
    item: Item | None = None
    feed_updated: datetime | None = None
    error: str = ""
    etag: str = ""
    last_modified: str = ""

    @property
    def ok(self) -> bool:
        return self.not_modified or self.item is not None


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def parse_iso(text: str | None) -> datetime | None:
    return datetime.fromisoformat(text.replace("Z", "+00:00")) if text else None


def load_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def write_if_changed(path: Path, data) -> bool:
    payload = json.dumps(data, ensure_ascii=False, indent=1, sort_keys=False) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") == payload:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(payload, encoding="utf-8")
    return True


def plausible(dt: datetime | None) -> datetime | None:
    return dt if dt and dt <= now_utc() + FUTURE_TOLERANCE else None


def pick_headline(items: list[Item], skip_pattern: str, base_url: str) -> Item | None:
    skip = re.compile(skip_pattern, re.I) if skip_pattern else None
    for item in items:
        if skip and skip.search(item.title):
            continue
        link = urljoin(base_url, item.link)
        if not link.startswith(("https://", "http://")):
            continue  # never pass javascript:, data: etc. to the frontend
        return Item(item.title, link, plausible(item.published))
    return None


async def fetch_one(client: httpx.AsyncClient, sem: asyncio.Semaphore, source: dict, cache: dict) -> Outcome:
    url = source["feed"]
    headers = {}
    cached = cache.get(url, {})
    if cached.get("etag"):
        headers["If-None-Match"] = cached["etag"]
    if cached.get("last_modified"):
        headers["If-Modified-Since"] = cached["last_modified"]

    out = Outcome()
    async with sem:
        for attempt in range(2):
            out = Outcome()
            try:
                resp = await client.get(url, headers=headers)
            except httpx.HTTPError as exc:
                out.error = type(exc).__name__
            else:
                out.http = resp.status_code
                if resp.status_code == 304:
                    out.not_modified = True
                    out.etag, out.last_modified = cached.get("etag", ""), cached.get("last_modified", "")
                elif resp.status_code == 200:
                    feed = parse(resp.content, resp.headers.get("content-type", ""))
                    if feed is None:
                        out.error = "no items"
                    else:
                        out.item = pick_headline(feed.items, source.get("skip_pattern", ""), str(resp.url))
                        out.error = "" if out.item else "all items skipped"
                        dates = [d for d in (plausible(i.published) for i in feed.items) if d]
                        out.feed_updated = max(dates) if dates else None
                        out.etag = resp.headers.get("etag", "")
                        out.last_modified = resp.headers.get("last-modified", "")
                else:
                    out.error = f"HTTP {resp.status_code}"
            retryable = out.http is None or out.http in RETRY_STATUS
            if out.ok or not retryable or attempt == 1:
                break
            await asyncio.sleep(RETRY_DELAY)
    return out


def staleness_reference(entry: dict) -> datetime | None:
    return parse_iso(entry.get("feed_updated")) or parse_iso(entry.get("published")) or parse_iso(entry.get("first_seen"))


async def run() -> int:
    started = time.monotonic()
    sources = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    cache = load_json(CACHE_FILE, {})
    old_headlines = load_json(HEADLINES_FILE, {"generated_at": None, "items": {}})
    old_status = load_json(STATUS_FILE, {})

    with_feed = [s for s in sources if s.get("feed") and s.get("feed_kind") != "none"]
    sem = asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient(
        timeout=TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8"},
        limits=httpx.Limits(max_connections=CONCURRENCY * 2),
    ) as client:
        outcomes = await asyncio.gather(*(fetch_one(client, sem, s, cache) for s in with_feed))
    results = {s["id"]: o for s, o in zip(with_feed, outcomes)}

    now = now_utc()
    items: dict[str, dict] = {}
    status: dict[str, dict] = {}
    new_cache: dict[str, dict] = {}

    for source in sources:
        sid = source["id"]
        old_item = old_headlines["items"].get(sid)
        prev = old_status.get(sid, {})
        runs, successes = prev.get("runs", 0), prev.get("successes", 0)
        entry = old_item

        if sid not in results:
            status[sid] = {"state": "no_feed", "last_success": None, "fail_streak": 0, "http": None}
            continue

        out = results[sid]
        runs += 1
        if out.ok:
            successes += 1
            fail_streak, last_success = 0, iso(now)
            if out.item is not None:
                same = old_item and old_item.get("url") == out.item.link and old_item.get("title") == out.item.title
                entry = {
                    "title": out.item.title,
                    "url": out.item.link,
                    "published": iso(out.item.published),
                    "first_seen": old_item["first_seen"] if same and old_item.get("first_seen") else iso(now),
                    "feed_updated": iso(out.feed_updated),
                    "fetched_at": iso(now),
                }
            elif entry is not None:
                entry = {**entry, "fetched_at": iso(now)}
            if out.etag or out.last_modified:
                new_cache[source["feed"]] = {k: v for k, v in (("etag", out.etag), ("last_modified", out.last_modified)) if v}
        else:
            fail_streak, last_success = prev.get("fail_streak", 0) + 1, prev.get("last_success")
            if source["feed"] in cache:
                new_cache[source["feed"]] = cache[source["feed"]]

        if entry is not None:
            items[sid] = entry

        ref = staleness_reference(entry) if entry else None
        if fail_streak >= DEAD_AFTER:
            state = "dead"
        elif fail_streak >= FAILING_AFTER:
            state = "failing"
        elif ref is None or now - ref > STALE_AFTER:
            state = "stale"
        else:
            state = "ok"

        status[sid] = {
            "state": state,
            "last_success": last_success,
            "fail_streak": fail_streak,
            "http": out.http,
            "runs": runs,
            "successes": successes,
        }
        if out.error:
            status[sid]["error"] = out.error

    # headlines.json only changes when a headline changes; fetched_at alone is not news.
    comparable = lambda d: {k: {f: v for f, v in e.items() if f != "fetched_at"} for k, e in d.items()}  # noqa: E731
    headlines_changed = comparable(items) != comparable(old_headlines["items"])
    if headlines_changed:
        write_if_changed(HEADLINES_FILE, {"generated_at": iso(now), "items": items})
    write_if_changed(STATUS_FILE, status)
    write_if_changed(CACHE_FILE, dict(sorted(new_cache.items())))

    states = [s["state"] for s in status.values()]
    counts = ", ".join(f"{k} {states.count(k)}" for k in ("ok", "stale", "failing", "dead", "no_feed"))
    changed = sum(
        1 for sid, e in items.items()
        if (old_headlines["items"].get(sid) or {}).get("url") != e["url"]
    )
    print(f"{len(sources)} sources in {time.monotonic() - started:.1f}s: {counts}; {changed} new headline(s)")
    for sid, o in results.items():
        if not o.ok:
            print(f"  FAIL {sid:<28} {o.error}", file=sys.stderr)
    return 0


def main() -> int:
    return asyncio.run(run())


if __name__ == "__main__":
    raise SystemExit(main())
