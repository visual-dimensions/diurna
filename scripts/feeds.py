"""Generic feed parsing shared by discover_feeds.py and fetch_headlines.py.

Two publisher-provided, machine-readable formats are supported, both generic
(no per-site logic):

- "rss":          RSS 0.9x/1.0/2.0 and Atom, via feedparser. Item order is kept,
                  because many feeds are sorted by front-page placement.
- "news_sitemap": Google News sitemaps (<urlset> with <news:news> entries).
                  They carry exactly title, link and publication date. Their
                  order is not meaningful, so items are sorted newest first.
"""

from __future__ import annotations

import calendar
import html
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone

import feedparser

SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
NEWS_NS = "{http://www.google.com/schemas/sitemap-news/0.9}"


@dataclass
class Item:
    title: str
    link: str
    published: datetime | None


@dataclass
class Feed:
    format: str  # "rss" | "news_sitemap"
    title: str
    items: list[Item]


def clean_title(raw: str) -> str:
    """Strip HTML tags and entities, normalise whitespace."""
    text = re.sub(r"<[^>]+>", " ", raw or "")
    return re.sub(r"\s+", " ", html.unescape(html.unescape(text))).strip()


def _from_struct(struct) -> datetime | None:
    if not struct:
        return None
    return datetime.fromtimestamp(calendar.timegm(struct), tz=timezone.utc)  # feedparser structs are UTC


def _from_iso(text: str | None) -> datetime | None:
    if not text:
        return None
    try:
        value = datetime.fromisoformat(text.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def parse_news_sitemap(content: bytes) -> Feed | None:
    if b"sitemap-news" not in content[:4000]:
        return None
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return None
    if root.tag != f"{SITEMAP_NS}urlset":
        return None
    items = []
    for url in root.iter(f"{SITEMAP_NS}url"):
        news = url.find(f"{NEWS_NS}news")
        if news is None:
            continue
        title = clean_title(news.findtext(f"{NEWS_NS}title") or "")
        link = (url.findtext(f"{SITEMAP_NS}loc") or "").strip()
        if title and link:
            items.append(Item(title, link, _from_iso(news.findtext(f"{NEWS_NS}publication_date"))))
    if not items:
        return None
    oldest = datetime.min.replace(tzinfo=timezone.utc)
    items.sort(key=lambda i: i.published or oldest, reverse=True)
    name = root.find(f"{SITEMAP_NS}url/{NEWS_NS}news/{NEWS_NS}publication/{NEWS_NS}name")
    return Feed("news_sitemap", clean_title(name.text if name is not None else ""), items)


def parse(content: bytes, content_type: str = "") -> Feed | None:
    """Parse a feed in any supported format; None if it has no usable items."""
    sitemap = parse_news_sitemap(content)
    if sitemap:
        return sitemap
    parsed = feedparser.parse(content, response_headers={"content-type": content_type})
    items = [
        Item(clean_title(e.title), e.link.strip(), _from_struct(e.get("published_parsed") or e.get("updated_parsed")))
        for e in parsed.entries
        if e.get("title") and e.get("link")
    ]
    items = [i for i in items if i.title]
    if not items:
        return None
    return Feed("rss", clean_title(parsed.feed.get("title", "")), items)
