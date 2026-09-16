#!/usr/bin/env bash
# Build every settlement marker style × scale and its egg overlay (#1155).
#
#   tools/art/build-settlements.sh [style ...]
#
# Without arguments every style in settlement_styles.py is built. Each run
# exports the GLB, validates it, renders docs/design/renders/<id>_*.png and
# updates tools/art/placeholders.manifest.json; then sync
# src/graphics/data/model-manifest.ts (the manifest test compares them).
set -euo pipefail
cd "$(dirname "$0")/../.."

STYLES=("$@")
if [ ${#STYLES[@]} -eq 0 ]; then
  STYLES=(north-american european slavic middle-eastern african south-asian east-asian southeast-asian latin-american oceanian)
fi

for style in "${STYLES[@]}"; do
  for scale in rural town city; do
    for kind in settlement settlement-eggs; do
      blender -b --python tools/art/make_model.py -- \
        --script "tools/art/models/overworld-$kind.py" \
        --build-arg "style=$style" --build-arg "scale=$scale" \
        --id "overworld.$kind.$style.$scale" --category props \
        --file "overworld-$kind-$style-$scale.glb" --quality final --no-textured \
        --footprint 0.6x0.6 --max-triangles 4000 2>&1 | grep -E "^(OK|FAIL|Error|Traceback|  File|.*Error)" || true
    done
  done
done
