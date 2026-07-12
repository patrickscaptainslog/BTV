#!/usr/bin/env python3
"""Auto-detect tennis rally highlights in match footage via audio analysis.

Ball strikes are sharp broadband transients; a rally is a dense cluster of
them. Pipeline: extract mono audio -> spectral-flux onset detection ->
cluster onsets into rallies -> score rallies -> motion cross-check the top
candidates -> write highlights.json (chronological cut list).

Usage: detect_highlights.py VIDEO [--clips 15] [--target-secs 130] [--out highlights.json]
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.ndimage import median_filter

SR = 16000
FRAME = 512          # 32 ms
HOP = 256            # 16 ms
MIN_STRIKE_GAP = 0.25    # s, two hits can't be closer than this
RALLY_GAP = 2.2          # s, max gap between strikes within one rally
MIN_SHOTS = 4
MIN_RALLY_SECS = 3.0
PAD = 1.5                # s of context on each side of a rally


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def extract_audio(video: Path, wav: Path):
    run(["ffmpeg", "-y", "-i", str(video), "-vn", "-ac", "1", "-ar", str(SR),
         "-acodec", "pcm_s16le", str(wav)])


def spectral_flux_onsets(x: np.ndarray):
    """Return (times, strengths, band_energy_per_frame)."""
    x = x.astype(np.float32)
    x /= (np.abs(x).max() or 1.0)
    n_frames = 1 + (len(x) - FRAME) // HOP
    win = np.hanning(FRAME).astype(np.float32)
    idx = np.arange(FRAME)[None, :] + HOP * np.arange(n_frames)[:, None]
    frames = x[idx] * win
    mag = np.abs(np.fft.rfft(frames, axis=1))
    # Ball-strike energy lives roughly in 500 Hz - 6 kHz
    freqs = np.fft.rfftfreq(FRAME, 1 / SR)
    band = (freqs >= 500) & (freqs <= 6000)
    flux = np.maximum(mag[1:] - mag[:-1], 0.0)[:, band].sum(axis=1)
    flux = np.concatenate([[0.0], flux])
    band_energy = (mag[:, band] ** 2).sum(axis=1)
    times = np.arange(n_frames) * HOP / SR
    return times, flux, band_energy


def pick_strikes(times, flux):
    """Adaptive-threshold peak picking on the flux curve."""
    med = median_filter(flux, size=int(1.0 * SR / HOP) | 1)  # ~1 s local median
    mad = median_filter(np.abs(flux - med), size=int(1.0 * SR / HOP) | 1)
    thresh = med + 6.0 * (mad + 1e-9)
    peaks = []
    min_gap = int(MIN_STRIKE_GAP * SR / HOP)
    i = 1
    while i < len(flux) - 1:
        if flux[i] > thresh[i] and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1]:
            peaks.append(i)
            i += min_gap
        else:
            i += 1
    return np.array(peaks, dtype=int)


def cluster_rallies(times, peaks, flux, band_energy):
    rallies = []
    if len(peaks) == 0:
        return rallies
    start = prev = peaks[0]
    members = [peaks[0]]
    for p in peaks[1:]:
        if times[p] - times[prev] <= RALLY_GAP:
            members.append(p)
        else:
            rallies.append(members)
            members = [p]
        prev = p
    rallies.append(members)

    out = []
    for m in rallies:
        t0, t1 = times[m[0]], times[m[-1]]
        dur = t1 - t0
        shots = len(m)
        if shots < MIN_SHOTS or dur < MIN_RALLY_SECS:
            continue
        # Closing intensity: loudness of the final strike + crowd/shout energy
        # in the 1.5 s after the last hit (winners get celebrated).
        final_flux = flux[m[-1]]
        after = band_energy[m[-1]: m[-1] + int(1.5 * SR / HOP)]
        shout = float(np.mean(after)) if len(after) else 0.0
        score = shots * 1.0 + dur * 0.35 + 2.0 * final_flux / (flux[m].mean() + 1e-9) \
            + 0.5 * shout / (band_energy.mean() + 1e-9)
        out.append({"start": float(t0), "end": float(t1), "shots": shots,
                    "duration": round(dur, 2), "score": round(float(score), 3)})
    return out


def motion_ok(video: Path, start: float, dur: float) -> bool:
    """Cheap motion cross-check: decode the segment tiny and low-fps, measure
    mean inter-frame difference. Rejects clusters where nothing moves on
    screen (e.g. sounds from a neighbouring court)."""
    try:
        p = run(["ffmpeg", "-ss", f"{max(0, start):.2f}", "-t", f"{dur:.2f}",
                 "-i", str(video), "-vf", "scale=160:-2,fps=4,signalstats,metadata=print",
                 "-f", "null", "-"])
    except subprocess.CalledProcessError:
        return True  # don't drop clips on probe failure
    yavgs = [float(l.rsplit("=", 1)[1]) for l in p.stderr.splitlines()
             if "signalstats.YAVG" in l]
    if len(yavgs) < 3:
        return True
    return float(np.abs(np.diff(yavgs)).mean()) > 0.15


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video", type=Path)
    ap.add_argument("--clips", type=int, default=15)
    ap.add_argument("--target-secs", type=float, default=130.0)
    ap.add_argument("--out", type=Path, default=Path("highlights.json"))
    ap.add_argument("--skip-motion-check", action="store_true")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "audio.wav"
        print("Extracting audio...", flush=True)
        extract_audio(args.video, wav)
        sr, x = wavfile.read(wav)
        assert sr == SR

    print("Detecting ball strikes...", flush=True)
    times, flux, band_energy = spectral_flux_onsets(x)
    peaks = pick_strikes(times, flux)
    print(f"  {len(peaks)} strike candidates", flush=True)

    rallies = cluster_rallies(times, peaks, flux, band_energy)
    print(f"  {len(rallies)} rallies (>= {MIN_SHOTS} shots, >= {MIN_RALLY_SECS}s)", flush=True)
    if not rallies:
        sys.exit("No rallies detected - check the audio track.")

    # Take best-scoring rallies until we hit the clip count / duration target,
    # motion-checking as we go, then restore chronological order.
    picked = []
    total = 0.0
    for r in sorted(rallies, key=lambda r: -r["score"]):
        if len(picked) >= args.clips or total >= args.target_secs:
            break
        s, e = max(0.0, r["start"] - PAD), r["end"] + PAD
        if not args.skip_motion_check and not motion_ok(args.video, s, e - s):
            print(f"  dropped {s:8.1f}s (no on-screen motion)", flush=True)
            continue
        picked.append({**r, "start": round(s, 2), "end": round(e, 2)})
        total += e - s
    picked.sort(key=lambda r: r["start"])

    args.out.write_text(json.dumps(
        {"source": str(args.video), "total_secs": round(total, 1), "clips": picked},
        indent=2))
    print(f"\n{len(picked)} clips, {total:.0f}s total -> {args.out}")
    for c in picked:
        print(f"  {c['start']:8.1f} - {c['end']:8.1f}  shots={c['shots']:2d}  score={c['score']}")


if __name__ == "__main__":
    main()
