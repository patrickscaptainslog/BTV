#!/usr/bin/env python3
"""Motion-primary highlight selection.

Segments each video by sustained on-court motion (smoothed YDIF inside the
court crop), then scores each active segment by the ball strikes the audio
detector found inside it. Motion says "someone is playing on THIS court";
audio says "and it was a real rally worth watching".

Usage: motion_segments.py out.json motionA.csv:strikesA.json [B...]
       [--clips 16] [--target-secs 140]
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

ACTIVE_YDIF = 2.2
HANDLING_YDIF = 8.0      # raw median above this = camera being handled
SMOOTH_SECS = 5.5
MERGE_GAP = 8.0
MIN_SEG = 3.5
MAX_CLIP = 20.0          # long segments keep their ending (the point's climax)
EDGE_SECS = 40.0
MIN_STRIKES = 4
PAD_OUT = 1.5            # extend past motion drop to catch the reaction


def rolling_median(y, k):
    return np.array([np.median(y[max(0, i - k // 2): i + k // 2 + 1])
                     for i in range(len(y))])


ap = argparse.ArgumentParser()
ap.add_argument("out", type=Path)
ap.add_argument("pairs", nargs="+", help="motion.csv:strikes.json")
ap.add_argument("--clips", type=int, default=16)
ap.add_argument("--target-secs", type=float, default=140.0)
args = ap.parse_args()

pool = []
for order, pair in enumerate(args.pairs):
    mo_path, st_path = pair.split(":")
    strikes = json.loads(Path(st_path).read_text())
    s_times = np.array(strikes["times"])
    s_flux = np.array(strikes["flux"])
    a = np.loadtxt(mo_path, delimiter=",")
    t, y = a[:, 0], a[:, 1]
    dt = float(np.median(np.diff(t)))
    ys = rolling_median(y, max(3, int(SMOOTH_SECS / dt) | 1))
    vid_end = t[-1]

    active = ys > ACTIVE_YDIF
    # contiguous runs -> segments
    segs = []
    i = 0
    while i < len(active):
        if active[i]:
            j = i
            while j + 1 < len(active) and active[j + 1]:
                j += 1
            segs.append([t[i], t[j]])
            i = j + 1
        else:
            i += 1
    # merge close segments
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] <= MERGE_GAP:
            merged[-1][1] = s[1]
        else:
            merged.append(s)

    kept = 0
    for t0, t1 in merged:
        if t1 - t0 < MIN_SEG:
            continue
        if t0 < EDGE_SECS or t1 > vid_end - EDGE_SECS:
            print(f"  drop {t0:7.1f}-{t1:7.1f}: recording edge", file=sys.stderr)
            continue
        m = (t >= t0) & (t <= t1)
        if np.median(y[m]) > HANDLING_YDIF:
            print(f"  drop {t0:7.1f}-{t1:7.1f}: camera handling", file=sys.stderr)
            continue
        sm = (s_times >= t0 - 1) & (s_times <= t1 + 1)
        n_strikes = int(sm.sum())
        if n_strikes < MIN_STRIKES:
            print(f"  drop {t0:7.1f}-{t1:7.1f}: only {n_strikes} strikes "
                  f"(ball-collecting?)", file=sys.stderr)
            continue
        # score: shots + duration + how loud the closing strike was + motion level
        closing = float(s_flux[sm][-1] / (s_flux[sm].mean() + 1e-9)) if n_strikes else 0.0
        dur = t1 - t0
        score = n_strikes + 0.35 * dur + 2.0 * closing + float(np.percentile(y[m], 75))
        c0 = max(t0 - 1.0, t1 + PAD_OUT - MAX_CLIP) if dur + PAD_OUT > MAX_CLIP else t0 - 1.0
        pool.append({"start": round(float(c0), 2), "end": round(float(t1 + PAD_OUT), 2),
                     "shots": n_strikes, "duration": round(dur, 1),
                     "score": round(score, 2), "source": strikes["source"],
                     "_order": order})
        kept += 1
    print(f"{Path(strikes['source']).name}: {len(merged)} motion segments, "
          f"{kept} kept", file=sys.stderr)

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
    print(f"  {Path(c['source']).name}  {c['start']:8.1f}-{c['end']:8.1f}  "
          f"shots={c['shots']:3d}  score={c['score']}")
