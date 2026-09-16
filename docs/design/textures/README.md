# Textures

PNGs under `public/assets/textures/`, registered in `src/graphics/data/texture-manifest.ts`. Every generated texture has a sidecar here with the prompt (architecture §7); procedural ones name their build script.

| Texture | Id | Size | Source |
|---|---|---|---|
| [unit-atlases](unit-atlases.md) | `units.tdf-atlas`, `units.bug-atlas`, `tiles.env-atlas` | 512² each | procedural, `tools/art/build-textures.mjs` |

Ground, roof and concrete cells were repainted for readability at 64 px per tile in #441; the rule they follow is style guide §7.

Budget: ≤ 1024² (style guide §6). The strategic map's Earth is not a texture: it is drawn as vector coastlines from `src/graphics/data/earth-coastlines.ts`, built by `tools/art/build-coastlines.mjs` from Natural Earth (#1144).
