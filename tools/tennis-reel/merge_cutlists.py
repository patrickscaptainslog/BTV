#!/usr/bin/env python3
"""Merge per-video highlights.json files into one cut list.

Keeps the best clips across all sources up to a clip/duration budget, then
orders them by source (in the order given) and timestamp so the reel plays
in match order. Stamps each clip with its source path.

Usage: merge_cutlists.py out.json a_highlights.json b_highlights.json [--clips 16] [--target-secs 140]
"""
import argparse
import json
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("out", type=Path)
ap.add_argument("cutlists", nargs="+", type=Path)
ap.add_argument("--clips", type=int, default=16)
ap.add_argument("--target-secs", type=float, default=140.0)
args = ap.parse_args()

pool = []
for order, cl in enumerate(args.cutlists):
    data = json.loads(cl.read_text())
    for c in data["clips"]:
        pool.append({**c, "source": data["source"], "_order": order})

picked, total = [], 0.0
for c in sorted(pool, key=lambda c: -c["score"]):
    if len(picked) >= args.clips or total >= args.target_secs:
        break
    picked.append(c)
    total += c["end"] - c["start"]
picked.sort(key=lambda c: (c["_order"], c["start"]))
for c in picked:
    del c["_order"]

args.out.write_text(json.dumps({"total_secs": round(total, 1), "clips": picked}, indent=2))
print(f"{len(picked)} clips, {total:.0f}s -> {args.out}")
for c in picked:
    print(f"  {Path(c['source']).name}  {c['start']:8.1f}-{c['end']:8.1f}  shots={c['shots']:2d}  score={c['score']}")
