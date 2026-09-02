#!/usr/bin/env bash
# Generate a PNG with the Codex CLI built-in image tool.
#
#   tools/art/gen-image.sh <prompt-file> <out.png>
#
# Recipe: see docs/handoff/art-director.md §5. Requires `codex` on PATH with
# `codex-code-mode-host` beside it. Uses the full-access sandbox because the
# container cannot create user namespaces for bubblewrap.
set -euo pipefail

PROMPT_FILE="$1"
OUT="$2"
mkdir -p "$(dirname "$OUT")"
OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/tut-gen-image.XXXXXX")"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"

PROMPT="$(cat "$PROMPT_FILE")

Save the final image as a PNG file at exactly this path: $OUT_ABS
Use your built-in image generation tool; do not write code to draw the image. Generate exactly one image. Reply with only the saved path."

codex exec --skip-git-repo-check --ephemeral -s danger-full-access \
  -C "$WORK" -o "$WORK/last.txt" "$PROMPT" >"$WORK/stdout.log" 2>"$WORK/stderr.log" || true

if [ ! -s "$OUT_ABS" ]; then
  # Fallback: pull the newest image from this session's generated_images folder.
  SID="$(grep -m1 'session id:' "$WORK/stderr.log" | awk '{print $NF}' || true)"
  if [ -n "$SID" ] && [ -d "$CODEX_HOME_DIR/generated_images/$SID" ]; then
    NEWEST="$(ls -t "$CODEX_HOME_DIR/generated_images/$SID"/*.png 2>/dev/null | head -1 || true)"
    [ -n "$NEWEST" ] && cp "$NEWEST" "$OUT_ABS"
  fi
fi

if [ -s "$OUT_ABS" ]; then
  echo "OK $OUT_ABS ($(file -b "$OUT_ABS" | cut -d, -f1-2)) log=$WORK"
else
  echo "FAIL $OUT_ABS log=$WORK" >&2
  tail -20 "$WORK/stderr.log" >&2
  exit 1
fi
