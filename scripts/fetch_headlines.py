"""Fetch the current headline for every source in data/sources.json.

Phase 0 placeholder: verifies the environment only. The real fetcher
follows in Phase 2 (see CLAUDE.md, section 6).
"""

import sys

import feedparser
import httpx


def main() -> int:
    print(f"Python {sys.version.split()[0]}, feedparser {feedparser.__version__}, httpx {httpx.__version__}")
    print("fetch_headlines: not implemented yet (Phase 2).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
