"""Replace regional (tier 3) outlets without a reachable feed by the next candidates.

    refill_regional.py MX BR AR …            up to 3 rounds
    refill_regional.py --rounds 1 US

Rule from CLAUDE.md (section 10, wave 1): tier 1/2 outlets without a feed stay
(greyed out, principle 4); a tier 3 outlet without a feed is replaced by the next
Wikidata candidate. Each round:
  1. tier 3 outlets of these countries with feed_kind none in discovery_report.csv
     get a `no` decision in decisions.csv (with the reason), matched by homepage domain;
  2. import_wikidata.py --reselect / --accept, build_sources.py;
  3. discover_feeds.py --only <newcomers>.
Outlets from hand-made seed files have no Wikidata ID and are only reported.
Newcomers need a human look afterwards (CLAUDE.md lists typical misfits).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable
REASON = "regional outlet without a reachable feed – replaced"


def domain(url: str) -> str:
    host = urlsplit(url if "://" in url else "http://" + url).hostname or ""
    return re.sub(r"^(www\d?|m)\.", "", host.lower())


def run(*args: str) -> None:
    result = subprocess.run([PY, *args], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        sys.exit(f"{' '.join(args)} failed:\n{result.stdout[-2000:]}{result.stderr[-2000:]}")


def sources() -> dict[str, dict]:
    return {s["id"]: s for s in json.loads((ROOT / "data/sources.json").read_text(encoding="utf-8"))}


def report() -> dict[str, dict]:
    with (ROOT / "data/discovery_report.csv").open(encoding="utf-8", newline="") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("countries", nargs="+")
    parser.add_argument("--rounds", type=int, default=3)
    args = parser.parse_args()
    countries = [c.upper() for c in args.countries]

    for rnd in range(1, args.rounds + 1):
        srcs, rep = sources(), report()
        dead = [s for s in srcs.values() if s["country"] in countries and s["tier"] == 3 and rep.get(s["id"], {}).get("feed_kind") == "none"]
        qids: dict[tuple[str, str], str] = {}
        for cc in countries:
            path = ROOT / f"data/seed/candidates/{cc}.csv"
            if path.exists():
                with path.open(encoding="utf-8", newline="") as f:
                    qids.update({(cc, domain(r["homepage"])): r["qid"] for r in csv.DictReader(f)})
        decisions = [(s, qids.get((s["country"], domain(s["homepage"])))) for s in dead]
        manual = [s["id"] for s, q in decisions if not q]
        if manual:
            print(f"  from hand-made seeds, not replaced automatically: {', '.join(manual)}")
        decisions = [(s, q) for s, q in decisions if q]
        if not decisions:
            print(f"round {rnd}: no regional outlets without feed left")
            break
        with (ROOT / "data/seed/candidates/decisions.csv").open("a", encoding="utf-8", newline="") as f:
            writer = csv.writer(f, lineterminator="\n")
            for s, q in decisions:
                writer.writerow([s["country"], q, "no", "", "", "", "", "", "", REASON])
        print(f"round {rnd}: {len(decisions)} regional outlets without feed → replaced")

        run("scripts/import_wikidata.py", "--reselect", *countries)
        for cc in countries:
            (ROOT / f"data/seed/{cc.lower()}.csv").unlink(missing_ok=True)
        run("scripts/import_wikidata.py", "--accept", *countries)
        run("scripts/build_sources.py")
        new = [sid for sid in sources() if sid not in rep]
        print(f"  {len(new)} new outlets → feed discovery")
        if not new:
            break
        run("scripts/discover_feeds.py", "--only", ",".join(new))
        rep = report()
        print(f"  {sum(rep[i]['feed_kind'] != 'none' for i in new if i in rep)} of {len(new)} have a feed: {', '.join(new)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
