"""Check hand-researched feed URLs before they go into data/feed_overrides.csv.

    check_feeds.py candidates.json     {"source-id": ["https://feed-1", "https://feed-2"], ...}

Prints, per URL, whether it is a valid feed (RSS/Atom or news sitemap, also
sitemap indexes), with item count, age of the newest item and the first title –
using the same parser and user agent as the pipeline.
"""

from __future__ import annotations

import asyncio
import json
import sys

import httpx

from discover_feeds import TIMEOUT, USER_AGENT, Candidate, check_feed


async def main(path: str) -> None:
    wanted: dict[str, list[str]] = json.loads(open(path, encoding="utf-8").read())
    pairs = [(sid, Candidate(url=u)) for sid, urls in wanted.items() for u in urls]
    sem = asyncio.Semaphore(12)

    async def one(c: Candidate) -> None:
        async with sem:
            await check_feed(client, c)

    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
        await asyncio.gather(*(one(c) for _, c in pairs))
    for sid, c in pairs:
        if c.valid:
            age = f"{c.newest_age_h:.1f}h" if c.newest_age_h is not None else "undated"
            print(f"OK  {sid:<28} {c.url}\n      {c.format}, {c.items} items, newest {age} | {c.first_title[:80]}")
        else:
            print(f"--  {sid:<28} {c.url}  [{c.status}]")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    asyncio.run(main(sys.argv[1]))
