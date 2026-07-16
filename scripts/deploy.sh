#!/usr/bin/env bash
# vault の .obsidian/plugins/clippings-dedupe/ に main.js と manifest.json をコピーする。
# vault の場所はリポジトリ直下の .vaultpath（gitignore済み）に1行で書く。
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .vaultpath ]]; then
  echo "error: .vaultpath がありません。vault のパスを1行書いてください。" >&2
  exit 1
fi
VAULT="$(cat .vaultpath)"
DEST="$VAULT/.obsidian/plugins/clippings-dedupe"
mkdir -p "$DEST"
npm test
cp main.js manifest.json "$DEST/"
echo "deployed to: $DEST"
