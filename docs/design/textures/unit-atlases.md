# Textures: palette atlases (units and environment)

| | | |
|---|---|---|
| ![TDF atlas](../../../public/assets/textures/units/tdf-atlas_albedo.png) | ![Bug atlas](../../../public/assets/textures/units/bug-atlas_albedo.png) | ![Env atlas](../../../public/assets/textures/tiles/env-atlas_albedo.png) |

- **Assets**: `public/assets/textures/units/tdf-atlas_albedo.png` (`units.tdf-atlas`), `bug-atlas_albedo.png` (`units.bug-atlas`) and `public/assets/textures/tiles/env-atlas_albedo.png` (`tiles.env-atlas`, #394), 512² sRGB, in `src/graphics/data/texture-manifest.ts`.
- **Source**: procedural, `tools/art/build-textures.mjs` (`pnpm art:textures`). No prompt; every cell is drawn from a PRNG seeded by its token name, so the output is byte-stable.
- **Date**: 2026-09-02

## Layout

4×4 grid of 128 px cells, one per palette token (style guide §4). `ATLAS_CELLS` in the build script is the single source of the token → cell table; `build-placeholders.mjs` imports it to remap each textured mesh's UVs into its cell with a 3 % inset against filtering bleed. Every GLB whose tokens have a cell (units, tiles, buildings, props, Blender models alike) references its atlas by relative URI (`../../textures/units/<atlas>_albedo.png`), so the atlas is loaded once and shared.

| Style | Tokens | Detail |
|---|---|---|
| armour | `tdf-grey-*` | panel seams with bevel highlight, rivets at seam corners, wear scratches |
| cloth | `tdf-olive`, `tdf-olive-dark` | weave dither, blotchy tone, stitch line |
| decal | `tdf-orange`, `tdf-orange-dim` | flat with inset border |
| glass | `tdf-visor` | horizontal highlight band |
| chitin | `bug-chitin-*` | wrapping Voronoi plates with cracks and per-plate tone |
| flesh | `bug-flesh`, `bug-flesh-light` | blotchy tone with wobbling veins |
| glow | `bug-bio-green`, `bug-bio-magenta` | near-flat with a soft radial lift (emissive does the work) |
| residue | `bug-bio-green-dim` | mottled pools with dark spots |
| bone | `bug-bone` | pale grain with fine cracks |
| asphalt | `env-asphalt` | patch repairs, fine grain, one wandering crack, pebbles |
| paving | `env-sidewalk` | 2×2 slabs, dark seams, per-slab tone |
| slab | `env-concrete` | pour mottle, damp stains, hairline seam, chipped edges, pits |
| brick | `env-brick` | 16 px courses, half-offset bricks, light mortar |
| pane | `env-glass` | diagonal highlight band, one mullion |
| gravel | `env-roof` | weathering patches under a dense stone scatter |
| brushed | `env-metal` | horizontal streaks, rivet row |
| rust | `env-rust` | blotchy stains, dark pits |
| grass | `env-grass` | mid-scale patch tone, clumps and tufts, blade strokes, earth flecks |
| dirt | `env-dirt` | damp and dry patches, dried cracks, pebbles |
| sand | `env-sand` | dune shading under wind ripples, wind streaks, pebbles |
| snow | `env-snow` | drift hollows (shadows, not highlights), wind ripples, grit |
| rock | `env-rock` | Voronoi cracks, per-plate tone |
| water | `env-water-shallow`, `env-water-deep` | ripple bands, caustic streaks |
| foliage | `env-foliage` | leaf clumps, leafy mottle, dark gaps |

## Keep

- First pass. Enough surface variation that units and tiles stop reading as flat plastic at 64 px per tile while every cell stays on its palette hex on average. `env-bark` and `env-scrub` have no cell (16 cells per atlas) and stay flat.

## Change next pass

- Add a normal or roughness map when real models arrive; the base colour atlas is all the placeholders need.
- Cloth cells could carry a subtle camouflage blotch in `tdf-olive-dark`.

## Round 2: readable ground (#441)

![before and after](env-atlas-round-2.png)

The first pass textured everything but leant on per-pixel noise, which washes out at 64 px per tile: a snow tile was paper, grass was flat green. Round 2 repainted the eight weakest cells around one rule (style guide §7): detail at **mid scale** — noise of period 6–11 and `Cell.blob` ellipses 4–13 px across — never a tile-sized feature, because one model per tile id means a big blob repeats visibly across a field.

| Cell | std before | std after |
|---|---|---|
| `env-snow` | 2.8 | 12.7 |
| `env-sand` | 8.0 | 14.3 |
| `env-grass` | 5.3 | 10.0 |
| `env-dirt` | 6.1 | 9.0 |
| `env-foliage` | 6.4 | 8.4 |
| `env-concrete` | 4.0 | 7.3 |
| `env-roof` | 4.3 | 5.5 |
| `env-asphalt` | 2.6 | 3.0 (roads stay dark and calm on purpose) |

Unchanged: `env-sidewalk` (15.6) and `env-rock` (9.9) already read, and `env-brick`, `env-glass`, `env-metal`, `env-rust`, both waters keep their look. The TDF and bug atlases are byte-identical — only env styles moved.

Review harness: `node tools/art/preview/render-scene.mjs tools/art/preview/layouts/ground-field.json out.png` renders an 8×8 field of every ground surface with props for scale. `Cell.blob(cx, cy, rx, ry, k)` is the new painter helper; it wraps at the cell edges like `mul`, so blobs keep the cell tiling across box faces.
