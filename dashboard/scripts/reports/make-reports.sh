#!/usr/bin/env bash
# Build all boss-ready PDF reports from a dashboard CSV export.
#
#   ./make-reports.sh <leasing-report-export.csv> [out-dir]
#
# Produces in out-dir (default: current directory):
#   NeighbourGood-Weekly-Leasing-Report-<date>.pdf     (combined, with highlights)
#   NeighbourGood-<Property>-Leasing-Report-<date>.pdf (one per property)
#
# Requires Node and any headless Chrome/Chromium. Override the browser with
# CHROME=/path/to/chrome. In a Claude Code web session the pre-installed
# binary is under /opt/pw-browsers.
set -euo pipefail

CSV="${1:?usage: make-reports.sh <export.csv> [out-dir]}"
OUT="${2:-$PWD}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"

find_chrome() {
  if [ -n "${CHROME:-}" ]; then echo "$CHROME"; return; fi
  for c in /opt/pw-browsers/chromium-*/chrome-linux/chrome; do
    [ -x "$c" ] && { echo "$c"; return; }
  done
  for c in google-chrome chromium chromium-browser; do
    command -v "$c" >/dev/null && { echo "$c"; return; }
  done
  echo "ERROR: no Chrome/Chromium found; set CHROME=/path/to/chrome" >&2
  exit 1
}
CHROME_BIN="$(find_chrome)"

render() { # render <html> <pdf>
  "$CHROME_BIN" --headless --no-sandbox --disable-gpu --no-pdf-header-footer \
    --print-to-pdf="$2" "$1" 2>/dev/null
  echo "  -> $2"
}

echo "== weekly (combined) =="
STAMP="$(node "$HERE/genweekly.js" "$CSV" "$OUT" | awk '/^stamp /{print $2}')"
render "$OUT/weekly.html" "$OUT/NeighbourGood-Weekly-Leasing-Report-$STAMP.pdf"

echo "== per property =="
node "$HERE/genreport.js" "$CSV" "$OUT" >/dev/null
for f in "$OUT"/report-*.html; do
  slug="$(basename "$f" .html)"; slug="${slug#report-}"
  render "$f" "$OUT/NeighbourGood-$slug-Leasing-Report-$STAMP.pdf"
done

rm -f "$OUT"/weekly.html "$OUT"/report-*.html
echo "done."
