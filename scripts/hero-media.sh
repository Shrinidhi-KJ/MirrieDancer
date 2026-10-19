#!/usr/bin/env bash
# Prepares the hero footage: downloads a free Pexels aurora timelapse once, makes it
# loop seamlessly (the last 1.5 s cross-fades into the start) and compresses it for the web:
# 1440p and 1080p landscape for computers, and a portrait crop for phones.
# Footage: "Northern lights timelapse" by T Honkamies, Finland (Pexels licence: free to use
# and modify, no attribution required; we credit anyway).
# Usage: scripts/hero-media.sh <out-dir>. Never fails the deploy: without footage
# the page keeps its animated canvas sky.
set -uo pipefail
out="${1:-media}"
mkdir -p "$out"
if [ -s "$out/hero-wide-1080.mp4" ] && [ -s "$out/hero-tall.mp4" ]; then
  echo "hero footage already prepared"; exit 0
fi

SRC_URL="https://videos.pexels.com/video-files/28492331/12397893_2560_1440_24fps.mp4"
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
FADE=1.5

if ! command -v ffmpeg >/dev/null; then
  sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg >/dev/null || { echo "ffmpeg unavailable, skipping footage"; exit 0; }
fi

tmp="$(mktemp -d)"
if ! curl -fsSL --retry 3 -A "$UA" -e "https://www.pexels.com/" -o "$tmp/src.mp4" "$SRC_URL"; then
  echo "footage download failed"; rm -rf "$tmp"; exit 0
fi
dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmp/src.mp4")"
offset="$(awk -v d="$dur" -v f="$FADE" 'BEGIN { printf "%.3f", d - 2 * f }')"

# Seamless loop: play from FADE to the end, cross-fading the last FADE seconds into the
# first FADE seconds, so the final frame matches the first. No audio, web-friendly H.264.
encode() { # out, extra filters, crf
  ffmpeg -loglevel error -y -i "$tmp/src.mp4" -an -filter_complex \
    "[0:v]$2,fps=24,format=yuv420p,split[a][b];[a]trim=start=$FADE,setpts=PTS-STARTPTS[main];[b]trim=end=$FADE,setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=$FADE:offset=$offset,format=yuv420p[v]" \
    -map "[v]" -c:v libx264 -preset slow -crf "$3" -profile:v high -movflags +faststart "$1"
}

encode "$out/hero-wide-1440.mp4" "scale=2560:-2" 26 &&
encode "$out/hero-wide-1080.mp4" "scale=1920:-2" 26 &&
ffmpeg -loglevel error -y -i "$out/hero-wide-1080.mp4" -frames:v 1 -q:v 4 "$out/hero-wide.jpg" ||
echo "landscape footage failed to encode"

# Portrait crop for phones, centred a little right of middle where the curtains are brightest.
encode "$out/hero-tall.mp4" "crop=ih*9/16:ih:min(iw-ih*9/16\,iw*0.56-ih*9/32):0,scale=720:1280" 26 &&
ffmpeg -loglevel error -y -i "$out/hero-tall.mp4" -frames:v 1 -q:v 4 "$out/hero-tall.jpg" ||
echo "portrait footage failed to encode"

rm -rf "$tmp"
ls -la "$out"
exit 0
