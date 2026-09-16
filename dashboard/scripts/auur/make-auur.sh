#!/usr/bin/env bash
# One command for the AUUR Daily Logs: pull occupancy from AppFolio, fill the
# workbook, render the combined PDF.
#
#   ./make-auur.sh [out-dir]                          # pull from AppFolio, then build
#   ./make-auur.sh --snapshot <snapshot.json> [out-dir]   # build only (no AppFolio access needed)
#
# Needs Node 18+, `npm install` run once in dashboard/ (for exceljs), a
# Chrome/Chromium for the PDF (CHROME=/path to override), and AppFolio
# credentials in dashboard/.env.local for the pull step.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

SNAP=""
if [ "${1:-}" = "--snapshot" ]; then
  SNAP="${2:?usage: make-auur.sh --snapshot <snapshot.json> [out-dir]}"
  shift 2
fi
OUT="${1:-$HERE/out}"
mkdir -p "$OUT"

if [ ! -d "$HERE/../../node_modules/exceljs" ]; then
  echo "exceljs not installed — run 'npm install' in $(cd "$HERE/../.." && pwd) first" >&2
  exit 1
fi

if [ -z "$SNAP" ]; then
  SNAP="$OUT/occupancy-snapshot.json"
  echo "== pulling occupancy from AppFolio =="
  node "$HERE/pull-occupancy.js" --out "$SNAP"
  echo
fi

echo "== building workbook + PDF =="
node "$HERE/build-daily-logs.js" "$SNAP" --out "$OUT"
