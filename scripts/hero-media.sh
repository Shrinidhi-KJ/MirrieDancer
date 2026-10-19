#!/usr/bin/env bash
# Prepares the hero footage: downloads two free Pexels aurora timelapses once,
# makes each loop smoothly (plays forward then backward) and compresses it for the web.
# Pexels licence: free to use and modify, no attribution required (we credit anyway).
# Usage: scripts/hero-media.sh <out-dir>. Never fails the deploy: without footage
# the page keeps its animated canvas sky.
set -uo pipefail
out="${1:-media}"
mkdir -p "$out"
if [ -s "$out/hero-wide-1080.mp4" ] && [ -s "$out/hero-tall.mp4" ]; then
  echo "hero footage already prepared"; exit 0
fi

WIDE_URL="https://videos.pexels.com/video-files/35092214/14866548_2560_1440_25fps.mp4"   # Ken Cheung, Iceland
TALL_URL="https://videos.pexels.com/video-files/35206733/14915390_1440_2560_24fps.mp4"   # Alari Tammsalu, Lofoten
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

if ! command -v ffmpeg >/dev/null; then
  sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg >/dev/null || { echo "ffmpeg unavailable, skipping footage"; exit 0; }
fi

tmp="$(mktemp -d)"
get() { curl -fsSL --retry 3 -A "$UA" -e "https://www.pexels.com/" -o "$2" "$1"; }

# Forward then reversed, so the loop has no jump. Web-friendly H.264, no audio.
encode() { # in, out, scale filter, crf
  ffmpeg -loglevel error -y -i "$1" -an \
    -filter_complex "[0:v]$3,fps=25,format=yuv420p,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[v]" \
    -map "[v]" -c:v libx264 -preset slow -crf "$4" -profile:v high -movflags +faststart "$2"
}

if get "$WIDE_URL" "$tmp/wide.mp4"; then
  encode "$tmp/wide.mp4" "$out/hero-wide-1440.mp4" "scale=2560:-2" 25 &&
  encode "$tmp/wide.mp4" "$out/hero-wide-1080.mp4" "scale=1920:-2" 26 &&
  ffmpeg -loglevel error -y -i "$out/hero-wide-1080.mp4" -frames:v 1 -q:v 4 "$out/hero-wide.jpg" ||
  echo "wide footage failed to encode"
else
  echo "wide footage download failed"
fi

if get "$TALL_URL" "$tmp/tall.mp4"; then
  encode "$tmp/tall.mp4" "$out/hero-tall.mp4" "scale=1080:-2" 27 &&
  ffmpeg -loglevel error -y -i "$out/hero-tall.mp4" -frames:v 1 -q:v 4 "$out/hero-tall.jpg" ||
  echo "tall footage failed to encode"
else
  echo "tall footage download failed"
fi

rm -rf "$tmp"
ls -la "$out"
exit 0
