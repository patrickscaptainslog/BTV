#!/usr/bin/env python3
"""Compute a per-sample motion profile for a video: mean per-pixel frame
difference (signalstats YDIF) inside a center-court crop, at 2 fps.
Writes CSV rows of (time_sec, ydif).

Usage: motion_profile.py VIDEO OUT.csv
"""
import subprocess
import sys

video, out = sys.argv[1], sys.argv[2]
p = subprocess.run(
    ["ffmpeg", "-i", video,
     "-vf", "crop=iw*0.8:ih*0.5:iw*0.1:ih*0.4,scale=240:-2,fps=2,signalstats,metadata=print",
     "-f", "null", "-"],
    capture_output=True, text=True)
t = None
rows = []
for line in p.stderr.splitlines():
    if "pts_time:" in line:
        t = float(line.split("pts_time:")[1].split()[0])
    elif "signalstats.YDIF" in line and t is not None:
        rows.append((t, float(line.rsplit("=", 1)[1])))
with open(out, "w") as f:
    for t, y in rows:
        f.write(f"{t:.1f},{y:.4f}\n")
print(f"{len(rows)} samples -> {out}")
