# Textures: unit atlases

| | |
|---|---|
| ![TDF atlas](../../../public/assets/textures/units/tdf-atlas_albedo.png) | ![Bug atlas](../../../public/assets/textures/units/bug-atlas_albedo.png) |

- **Assets**: `public/assets/textures/units/tdf-atlas_albedo.png` (`units.tdf-atlas`) and `bug-atlas_albedo.png` (`units.bug-atlas`), 512² sRGB, in `src/graphics/data/texture-manifest.ts`.
- **Source**: procedural, `tools/art/build-textures.mjs` (`pnpm art:textures`). No prompt; every cell is drawn from a PRNG seeded by its token name, so the output is byte-stable.
- **Date**: 2026-09-02

## Layout

4×4 grid of 128 px cells, one per palette token (style guide §4). `ATLAS_CELLS` in the build script is the single source of the token → cell table; `build-placeholders.mjs` imports it to remap each textured mesh's UVs into its cell with a 3 % inset against filtering bleed. Unit GLBs reference the atlas by relative URI (`../../textures/units/<atlas>_albedo.png`), so the atlas is loaded once and shared.

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

## Keep

- First pass. Enough surface variation that units stop reading as flat plastic at 64 px per tile while every cell stays on its palette hex on average.

## Change next pass

- Add a normal or roughness map when real models arrive; the base colour atlas is all the placeholders need.
- Cloth cells could carry a subtle camouflage blotch in `tdf-olive-dark`.
