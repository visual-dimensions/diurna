"""Feed health after a stretch of regular operation – the acceptance check for each wave.

    npm run data                              # fetch the current pipeline state from the `data` branch
    .venv/bin/python scripts/health_report.py # → data/health_report.csv + summary on stdout

Per source: state, success rate (successes / runs), runs, observed since, fail streak,
last HTTP status and error. The summary groups the problems the way they are decided
(CLAUDE.md, section 10):
  - blocked:      HTTP 401/403/451 – the site refuses automated access (from GitHub's IPs)
  - rate-limited: HTTP 429
  - unreachable:  timeouts and connection errors
  - dead:         10+ failures in a row
  - stale:        reachable, but nothing newer than 48 h
  - low success:  success rate below 50 % after at least 10 runs
and lists sources observed for less than a week (their wave is not yet accepted).
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "data" / "sources.json"
STATUS = ROOT / "public" / "data" / "status.json"
REPORT = ROOT / "data" / "health_report.csv"
WEEK_HOURS = 7 * 24
FIELDS = ["id", "name", "country", "tier", "feed_kind", "state", "success_rate", "runs", "since", "fail_streak", "http", "error", "last_success"]


def parse(ts: str | None) -> datetime | None:
    return datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None


def category(s: dict) -> str:
    http, error = s.get("http"), s.get("error") or ""
    if s.get("state") == "no_feed":
        return ""
    if s.get("fail_streak", 0) == 0:
        return "stale" if s.get("state") == "stale" else ""
    if http in (401, 403, 451):
        return "blocked"
    if http == 429:
        return "rate-limited"
    if "Timeout" in error or "Connect" in error or "ReadError" in error or "RemoteProtocol" in error:
        return "unreachable"
    return f"error {http or error}"


def main() -> int:
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    status = json.loads(STATUS.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)

    rows, problems, young = [], Counter(), []
    for src in sources:
        s = status.get(src["id"], {})
        runs, successes = s.get("runs", 0), s.get("successes", 0)
        rate = successes / runs if runs else None
        rows.append({
            "id": src["id"], "name": src["name"], "country": src["country"], "tier": src["tier"],
            "feed_kind": src["feed_kind"], "state": s.get("state", "missing"),
            "success_rate": f"{rate:.0%}" if rate is not None else "", "runs": runs, "since": s.get("since", ""),
            "fail_streak": s.get("fail_streak", 0), "http": s.get("http") or "", "error": s.get("error", ""),
            "last_success": s.get("last_success") or "",
        })
        cat = category(s)
        if s.get("state") == "dead":
            cat = "dead"
        elif rate is not None and runs >= 10 and rate < 0.5 and not cat:
            cat = "low success"
        if cat:
            problems[cat] += 1
            rows[-1]["problem"] = cat
        since = parse(s.get("since"))
        if src["feed_kind"] != "none" and (since is None or (now - since).total_seconds() / 3600 < WEEK_HOURS):
            young.append(src["id"])

    with REPORT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[*FIELDS, "problem"], lineterminator="\n")
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda r: (r.get("problem", "~"), r["tier"], r["country"], r["id"])))

    states = Counter(r["state"] for r in rows)
    with_feed = [r for r in rows if r["feed_kind"] != "none"]
    rated = [status[r["id"]] for r in with_feed if status.get(r["id"], {}).get("runs")]
    overall = sum(s["successes"] for s in rated) / max(1, sum(s["runs"] for s in rated))
    print(f"{len(rows)} sources, {len(with_feed)} with feed – states: {dict(states)}")
    print(f"overall success rate {overall:.1%} over {sum(s['runs'] for s in rated)} fetches")
    print(f"problems: {dict(problems)}")
    for cat in sorted(problems):
        ids = [f"{r['id']} (t{r['tier']} {r['country']})" for r in rows if r.get("problem") == cat]
        print(f"  {cat}: {', '.join(ids[:25])}{' …' if len(ids) > 25 else ''}")
    print(f"observed for less than a week: {len(young)} of {len(with_feed)} sources with feed")
    print(f"report: {REPORT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
