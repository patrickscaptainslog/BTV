#!/usr/bin/env bash
# One command for the AUUR Daily Logs: pull occupancy from AppFolio, fill the
# workbook, render the combined PDF.
#
#   ./make-auur.sh [out-dir] [build options]
#   ./make-auur.sh --snapshot <snapshot.json> [out-dir] [build options]   # build only, no AppFolio access needed
#
# Build options are passed through to build-daily-logs.js: --no-pdf,
# --pdf-order newest-first. Pull option: --allow-empty-past.
#
# Needs Node 18+, `npm install` run once in dashboard/ (for exceljs), a
# Chrome/Chromium for the PDF (CHROME=/path to override), and AppFolio
# credentials in dashboard/.env.local for the pull step.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; }

SNAP=""
OUT=""
BUILD_ARGS=()
PULL_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --snapshot) SNAP="${2:?--snapshot needs a file}"; shift 2 ;;
    --no-pdf) BUILD_ARGS+=("$1"); shift ;;
    --pdf-order) BUILD_ARGS+=("$1" "${2:?--pdf-order needs a value}"); shift 2 ;;
    --allow-empty-past) PULL_ARGS+=("$1"); shift ;;
    -*) echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
    *) if [ -n "$OUT" ]; then echo "unexpected argument: $1" >&2; exit 64; fi; OUT="$1"; shift ;;
  esac
done
OUT="${OUT:-$HERE/out}"
mkdir -p "$OUT"

if [ ! -d "$HERE/../../node_modules/exceljs" ]; then
  echo "exceljs not installed — run 'npm install' in $(cd "$HERE/../.." && pwd) first" >&2
  exit 1
fi

if [ -z "$SNAP" ]; then
  SNAP="$OUT/occupancy-snapshot.json"
  echo "== pulling occupancy from AppFolio =="
  node "$HERE/pull-occupancy.js" --out "$SNAP" ${PULL_ARGS[@]+"${PULL_ARGS[@]}"}
  echo
fi

echo "== building workbook + PDF =="
node "$HERE/build-daily-logs.js" "$SNAP" --out "$OUT" ${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"}
