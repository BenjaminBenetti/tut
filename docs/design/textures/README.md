# Textures

PNGs under `public/assets/textures/`, registered in `src/graphics/data/texture-manifest.ts`. Every generated texture has a sidecar here with the prompt (architecture §7); procedural ones name their build script.

| Texture | Id | Size | Source |
|---|---|---|---|
| [earth-map](earth-map.md) | `overworld.earth-map` | 2048×1024 | generated, `prompts/earth-map.txt` |
| [unit-atlases](unit-atlases.md) | `units.tdf-atlas`, `units.bug-atlas`, `tiles.env-atlas` | 512² each | procedural, `tools/art/build-textures.mjs` |

Ground, roof and concrete cells were repainted for readability at 64 px per tile in #441; the rule they follow is style guide §7.

Budget: ≤ 1024² except the Earth map (style guide §6).
