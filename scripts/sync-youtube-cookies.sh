#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BROWSER="${BROWSER:-chrome}"
OUTPUT="${OUTPUT:-$ROOT_DIR/cookies/youtube.txt}"

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "yt-dlp no está instalado en el host."
  echo "Instalalo con: brew install yt-dlp"
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

echo "Exportando cookies desde $BROWSER → $OUTPUT"
yt-dlp \
  --cookies-from-browser "$BROWSER" \
  --cookies "$OUTPUT" \
  --skip-download \
  "https://www.youtube.com"

echo "Listo. Reiniciá el backend si ya estaba corriendo:"
echo "  docker compose restart backend"
