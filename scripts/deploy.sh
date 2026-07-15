#!/usr/bin/env bash
# Copy main.js and manifest.json into <vault>/.obsidian/plugins/clippings-dedupe/.
# Put your vault path (one line) in .vaultpath at the repo root (gitignored).
# If .plugin-data.json exists (gitignored), it is deployed as the plugin's
# data.json — use it to keep personal settings out of the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .vaultpath ]]; then
  echo "error: .vaultpath not found — write your vault path into it (one line)." >&2
  exit 1
fi
VAULT="$(cat .vaultpath)"
DEST="$VAULT/.obsidian/plugins/clippings-dedupe"
mkdir -p "$DEST"
npm test
cp main.js manifest.json "$DEST/"
if [[ -f .plugin-data.json ]]; then
  cp .plugin-data.json "$DEST/data.json"
  echo "personal settings deployed as data.json"
fi
echo "deployed to: $DEST"
