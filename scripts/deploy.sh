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
  # refuse to overwrite the plugin's data.json with something broken:
  # must parse as JSON and contain only known setting keys
  node -e '
    const fs = require("fs");
    const raw = JSON.parse(fs.readFileSync(".plugin-data.json", "utf8"));
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error("expected a JSON object");
    }
    const known = ["folder", "memoLabel", "mergedHeading", "headingKeyword", "keepBackups", "maxBackups"];
    const unknown = Object.keys(raw).filter((k) => !known.includes(k));
    if (unknown.length) throw new Error("unknown keys: " + unknown.join(", "));
  ' || { echo "error: .plugin-data.json failed validation — data.json not deployed." >&2; exit 1; }
  cp .plugin-data.json "$DEST/data.json"
  echo "personal settings deployed as data.json"
fi
echo "deployed to: $DEST"
