#!/usr/bin/env bash
# Builds VFX frame sheets from the single sprites (issue #395), deterministically with ImageMagick.
#
#   tools/art/build-vfx-strips.sh
#
# Each frame is 128×128 RGBA; sheets are 2×2 (four frames) or 3×2 (six frames),
# read left to right, top to bottom. Frames are scale/alpha variations of the
# source sprite so the sheet always matches the single sprite's look:
#
#   muzzle-flash: grow 55% → peak 100% → tongue 100%×125% wide → fade 80% @ 45%
#   impact:       spark 50% → full 100% → fragments 125% @ 70% → fade 140% @ 35%
#   egg-burst:    40% → 70% → 100% → 115% @ 85% → 125% @ 55% → 135% @ 25%
#   claw-slash:   the arc sweeps: 62% @ -14° → 88% @ 0° → 100% @ +8° @ 70% → 110% @ +14° @ 30%
#   bug-death:    45% → 75% → 100% → 112% @ 85% → 122% @ 55% → 132% @ 25%
#   tdf-death:    50% → 80% → 100% → 115% @ 80% → 128% @ 50% → 140% @ 20%
#                 (a machine throws its debris further than a body does)
#
# The tracer has no sheet: it is one streak the renderer stretches along the
# shot axis and fades, so frames would fight the stretch.
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=public/assets/sprites/vfx
TMP="$(mktemp -d "${TMPDIR:-/tmp}/tut-vfx.XXXXXX")"
FRAME=128

# frame <in> <out> <scale%> <alpha%> [xstretch%]
frame() {
  local in="$1" out="$2" scale="$3" alpha="$4" xs="${5:-100}"
  local px=$(( FRAME * scale / 100 ))
  local wx=$(( px * xs / 100 ))
  magick "$in" -resize "${wx}x${px}!" -background none -gravity center -extent "${FRAME}x${FRAME}" \
    -channel A -evaluate Multiply "$(awk "BEGIN{print $alpha/100}")" +channel "$out"
}

# rframe <in> <out> <scale%> <alpha%> <rotate-deg> — a frame that also swings.
rframe() {
  local in="$1" out="$2" scale="$3" alpha="$4" deg="$5"
  local px=$(( FRAME * scale / 100 ))
  magick "$in" -resize "${px}x${px}!" -background none -virtual-pixel none \
    -distort SRT "$deg" -background none -gravity center -extent "${FRAME}x${FRAME}" \
    -channel A -evaluate Multiply "$(awk "BEGIN{print $alpha/100}")" +channel "$out"
}

sheet() {
  local name="$1" tile="$2"; shift 2
  montage "$@" -tile "$tile" -geometry "${FRAME}x${FRAME}+0+0" -background none "$TMP/$name.png"
  magick "$TMP/$name.png" -strip -define png:compression-level=9 "png32:$SRC/$name-sheet.png"
  magick identify -format "$name-sheet.png %w x %h %[channels]\n" "$SRC/$name-sheet.png"
}

frame $SRC/muzzle-flash.png "$TMP/m0.png" 55 90
frame $SRC/muzzle-flash.png "$TMP/m1.png" 100 100
frame $SRC/muzzle-flash.png "$TMP/m2.png" 100 100 125
frame $SRC/muzzle-flash.png "$TMP/m3.png" 80 45
sheet muzzle-flash 2x2 "$TMP/m0.png" "$TMP/m1.png" "$TMP/m2.png" "$TMP/m3.png"

frame $SRC/impact.png "$TMP/i0.png" 50 100
frame $SRC/impact.png "$TMP/i1.png" 100 100
frame $SRC/impact.png "$TMP/i2.png" 125 70
frame $SRC/impact.png "$TMP/i3.png" 140 35
sheet impact 2x2 "$TMP/i0.png" "$TMP/i1.png" "$TMP/i2.png" "$TMP/i3.png"

frame $SRC/egg-burst.png "$TMP/e0.png" 40 100
frame $SRC/egg-burst.png "$TMP/e1.png" 70 100
frame $SRC/egg-burst.png "$TMP/e2.png" 100 100
frame $SRC/egg-burst.png "$TMP/e3.png" 115 85
frame $SRC/egg-burst.png "$TMP/e4.png" 125 55
frame $SRC/egg-burst.png "$TMP/e5.png" 135 25
sheet egg-burst 3x2 "$TMP/e0.png" "$TMP/e1.png" "$TMP/e2.png" "$TMP/e3.png" "$TMP/e4.png" "$TMP/e5.png"

rframe $SRC/claw-slash.png "$TMP/c0.png" 62 90 -14
rframe $SRC/claw-slash.png "$TMP/c1.png" 88 100 0
rframe $SRC/claw-slash.png "$TMP/c2.png" 100 70 8
rframe $SRC/claw-slash.png "$TMP/c3.png" 110 30 14
sheet claw-slash 2x2 "$TMP/c0.png" "$TMP/c1.png" "$TMP/c2.png" "$TMP/c3.png"

frame $SRC/bug-death.png "$TMP/d0.png" 45 100
frame $SRC/bug-death.png "$TMP/d1.png" 75 100
frame $SRC/bug-death.png "$TMP/d2.png" 100 100
frame $SRC/bug-death.png "$TMP/d3.png" 112 85
frame $SRC/bug-death.png "$TMP/d4.png" 122 55
frame $SRC/bug-death.png "$TMP/d5.png" 132 25
sheet bug-death 3x2 "$TMP/d0.png" "$TMP/d1.png" "$TMP/d2.png" "$TMP/d3.png" "$TMP/d4.png" "$TMP/d5.png"

frame $SRC/tdf-death.png "$TMP/t0.png" 50 100
frame $SRC/tdf-death.png "$TMP/t1.png" 80 100
frame $SRC/tdf-death.png "$TMP/t2.png" 100 100
frame $SRC/tdf-death.png "$TMP/t3.png" 115 80
frame $SRC/tdf-death.png "$TMP/t4.png" 128 50
frame $SRC/tdf-death.png "$TMP/t5.png" 140 20
sheet tdf-death 3x2 "$TMP/t0.png" "$TMP/t1.png" "$TMP/t2.png" "$TMP/t3.png" "$TMP/t4.png" "$TMP/t5.png"
rm -rf "$TMP"
