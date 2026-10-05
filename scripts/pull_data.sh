#!/usr/bin/env bash
# Copy the latest pipeline data from the `data` branch into the working tree
# (public/data/…, data/http_cache.json). Used by the workflows and for local
# development: `npm run data`. Does nothing if the branch does not exist yet.
set -euo pipefail
if ! git ls-remote --exit-code --heads origin data >/dev/null 2>&1; then
  echo "no data branch yet – starting empty"
  exit 0
fi
git fetch -q --depth=1 origin data
git archive FETCH_HEAD | tar -x
echo "data restored from: $(git log -1 --format=%s FETCH_HEAD)"
