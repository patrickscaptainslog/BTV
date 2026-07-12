#!/usr/bin/env python3
"""Assemble an epic highlight reel from a highlights.json cut list.

Renders each clip to a uniform intermediate (1080p30, 48k stereo, normalized
audio), adds slow-mo replays after the top-scored rallies, generates title /
closing cards, then joins everything with crossfades.

Usage: make_reel.py highlights.json [--title "PAT vs JACOB"] [--music track.mp3]
                    [--out out/tennis_reel.mp4] [--slowmo 3] [--workdir clips]
"""
import argparse
import json
import subprocess
from pathlib import Path

W, H, FPS = 1920, 1080, 30
XFADE = 0.4
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
VOUT = ["-c:v", "libx264", "-preset", "fast", "-crf", "19", "-pix_fmt", "yuv420p"]
AOUT = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def duration(f: Path) -> float:
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(f)], check=True, capture_output=True, text=True)
    return float(p.stdout.strip())


def esc(t: str) -> str:
    return t.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def title_card(path: Path, main: str, sub: str, secs: float = 2.5):
    vf = (f"drawtext=fontfile={FONT}:text='{esc(main)}':fontcolor=white:fontsize=110:"
          f"x=(w-text_w)/2:y=(h-text_h)/2-60:alpha='min(1,t/0.8)',"
          f"drawtext=fontfile={FONT}:text='{esc(sub)}':fontcolor=0xBBBBBB:fontsize=44:"
          f"x=(w-text_w)/2:y=(h-text_h)/2+80:alpha='min(1,max(0,(t-0.5)/0.8))'")
    run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=0x101418:s={W}x{H}:r={FPS}:d={secs}",
         "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo:d={secs}",
         "-vf", vf, "-shortest", *VOUT, *AOUT, str(path)])


def cut_clip(src: Path, start: float, end: float, path: Path):
    vf = (f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
          f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps={FPS},setsar=1")
    run(["ffmpeg", "-y", "-ss", f"{start:.2f}", "-to", f"{end:.2f}", "-i", str(src),
         "-vf", vf, "-af", "dynaudnorm=g=7:m=8,aresample=48000", *VOUT, *AOUT, str(path)])


def slowmo_replay(src: Path, start: float, end: float, path: Path, tail: float = 2.5):
    """Half-speed replay of the last `tail` seconds of a rally, slightly zoomed."""
    s = max(start, end - tail)
    vf = (f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
          f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,"
          f"crop=iw/1.15:ih/1.15,scale={W}:{H},"  # subtle punch-in for replay feel
          f"setpts=2.0*PTS,fps={FPS},setsar=1,"
          f"drawtext=fontfile={FONT}:text='REPLAY':fontcolor=white@0.85:fontsize=40:"
          f"x=w-text_w-50:y=50")
    run(["ffmpeg", "-y", "-ss", f"{s:.2f}", "-to", f"{end:.2f}", "-i", str(src),
         "-vf", vf, "-af", "atempo=0.5,dynaudnorm,aresample=48000", *VOUT, *AOUT, str(path)])


def concat_xfade(parts, out: Path, music: Path | None):
    """Chain all parts with video xfade + audio acrossfade in one pass."""
    inputs, filt = [], []
    for p in parts:
        inputs += ["-i", str(p)]
    durs = [duration(p) for p in parts]
    v_prev, a_prev = "[0:v]", "[0:a]"
    offset = 0.0
    for i in range(1, len(parts)):
        offset += durs[i - 1] - XFADE
        v_out, a_out = f"[v{i}]", f"[a{i}]"
        filt.append(f"{v_prev}[{i}:v]xfade=transition=fade:duration={XFADE}:offset={offset:.3f}{v_out}")
        filt.append(f"{a_prev}[{i}:a]acrossfade=d={XFADE}{a_out}")
        v_prev, a_prev = v_out, a_out
    total = offset + durs[-1]

    maps = ["-map", v_prev.strip("[]") and v_prev, "-map", a_prev]
    if music:
        mi = len(parts)
        inputs += ["-stream_loop", "-1", "-i", str(music)]
        filt.append(f"[{mi}:a]atrim=0:{total:.2f},volume=0.30,afade=t=out:st={total - 3:.2f}:d=3[mus]")
        filt.append(f"{a_prev}[mus]amix=inputs=2:duration=first:normalize=0[aout]")
        maps = ["-map", v_prev, "-map", "[aout]"]

    run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filt),
         *maps, *VOUT, *AOUT, "-movflags", "+faststart", str(out)])
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cutlist", type=Path)
    ap.add_argument("--title", default="PAT vs JACOB")
    ap.add_argument("--subtitle", default="Tennis Highlights")
    ap.add_argument("--music", type=Path, default=None)
    ap.add_argument("--slowmo", type=int, default=3, help="replay the N best rallies in slow-mo")
    ap.add_argument("--out", type=Path, default=Path("out/tennis_reel.mp4"))
    ap.add_argument("--workdir", type=Path, default=Path("clips"))
    args = ap.parse_args()

    data = json.loads(args.cutlist.read_text())
    src = Path(data["source"])
    clips = data["clips"]
    args.workdir.mkdir(parents=True, exist_ok=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    replay_ids = {id(c) for c in sorted(clips, key=lambda c: -c["score"])[:max(0, args.slowmo)]}

    parts = []
    intro = args.workdir / "00_intro.mp4"
    title_card(intro, args.title, args.subtitle)
    parts.append(intro)

    for i, c in enumerate(clips, 1):
        p = args.workdir / f"{i:02d}_clip.mp4"
        print(f"clip {i}/{len(clips)}  {c['start']:.1f}-{c['end']:.1f}s", flush=True)
        cut_clip(src, c["start"], c["end"], p)
        parts.append(p)
        if id(c) in replay_ids:
            r = args.workdir / f"{i:02d}_replay.mp4"
            slowmo_replay(src, c["start"], c["end"], r)
            parts.append(r)

    outro = args.workdir / "zz_outro.mp4"
    title_card(outro, "GAME. SET. MATCH.", args.title, secs=3.0)
    parts.append(outro)

    print("Rendering final reel...", flush=True)
    total = concat_xfade(parts, args.out, args.music)
    print(f"Done: {args.out}  ({total:.0f}s, {len(clips)} rallies, {len(parts)} segments)")


if __name__ == "__main__":
    main()
