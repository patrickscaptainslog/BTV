# Tennis Highlight Reel — Pat vs Jacob

Auto-detects the best rallies in tennis footage by audio analysis (ball-strike
transients clustered into rallies) and assembles an epic highlight reel with
title cards, crossfades, and slow-mo replays.

## Continuation instructions (for a fresh Claude session)

The source footage is two iPhone videos, `IMG_3468.MOV` (~1.2 GB) and
`IMG_3469.MOV` (~2.4 GB), in the owner's Google Drive, uploaded 2026-07-12 and
shared as "anyone with the link". Find them via the Google Drive connector
(`search_files` with `mimeType contains 'video/'`, newest first — ignore the
older duplicate copy of IMG_3469) or ask the user to paste the share links.

Steps — requires an environment whose network policy allows
`drive.google.com` + `drive.usercontent.google.com`:

```bash
apt-get update && apt-get install -y ffmpeg          # ffmpeg + ffprobe
pip install --break-system-packages numpy scipy gdown
cd tools/tennis-reel && mkdir -p work

# 1. Download footage (substitute the real file IDs found via Drive search)
python3 -m gdown "https://drive.google.com/uc?id=<IMG_3468_FILE_ID>" -O work/IMG_3468.MOV --continue
python3 -m gdown "https://drive.google.com/uc?id=<IMG_3469_FILE_ID>" -O work/IMG_3469.MOV --continue
ffprobe work/IMG_3468.MOV && ffprobe work/IMG_3469.MOV   # sanity check

# 2. Detect rallies in each video
python3 detect_highlights.py work/IMG_3468.MOV --clips 12 --target-secs 120 --out work/h_3468.json
python3 detect_highlights.py work/IMG_3469.MOV --clips 12 --target-secs 120 --out work/h_3469.json

# 3. Merge into one chronological cut list (~16 clips / ~140 s)
python3 merge_cutlists.py work/highlights_merged.json work/h_3468.json work/h_3469.json

# 4. REVIEW before rendering: extract a mid-clip frame for each entry in the
#    merged cut list and eyeball that they show actual play.

# 5. Render the reel (title cards, crossfades, slow-mo replays on top 3 rallies)
python3 make_reel.py work/highlights_merged.json --title "PAT vs JACOB" \
    --slowmo 3 --workdir work/clips --out work/tennis_reel.mp4

# 6. Verify: ffprobe duration/streams, extract a few frames, then deliver the
#    MP4 to the user (SendUserFile) along with highlights_merged.json.
```

Optional: `--music track.mp3` on make_reel.py mixes a user-supplied track
under the court audio (ducked to 30%, faded out at the end).

Delivery preferences agreed with the user: chronological order, natural court
sound unless he supplies music, ~2 min total, 1080p30 MP4.
