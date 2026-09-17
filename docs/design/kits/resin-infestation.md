# Resin Shell infestation

Implemented from the user's selection of **B — Resin Shell**, the approved 0–10 progression, and the request for double movement cost and a Map Lab slider (2026-09-17, [#1166](https://github.com/BenjaminBenetti/tut/issues/1166)). [Original concept review](../concepts/infestation-level/README.md).

## Review in Map Lab

Run `pnpm dev`, open Map Lab from the menu, and drag **Infestation Level**. A fixed comparison is `/mapgen-preview.html?seed=resin-review&biome=temperate&settlement=town&size=small&models=1&infestation=10`. Changing infestation preserves the seed, layout, camera and selected floor cut. The URL stores the dial; the stats show the marked tile count and movement penalty.

These are actual production-renderer captures of the same generated map and camera, not concept paint-overs:

| Level 0 | Level 1 |
|---|---|
| ![Unchanged baseline](../diagnostics/infestation/temperate-level-0.png) | ![Small shell patches](../diagnostics/infestation/temperate-level-1.png) |
| **Level 4** | **Level 7** |
| ![Established resin pockets](../diagnostics/infestation/temperate-level-4.png) | ![Connected shell coverage](../diagnostics/infestation/temperate-level-7.png) |

![Level 10 coats almost the entire map, including cliffs, foundations and rooftops](../diagnostics/infestation/temperate-level-10.png)

The ground is a connected web of curved arteries, finer branches and stretched brown membrane. The wider strands span several tiles; clean edges taper inward. The dial widens the same web and shrinks its irregular tears through an authored growth morph. Swept, pointed shell blades climb walls and selected prop bases. Window growth clusters in columns, and fences do not receive repeated collars. Wall growth starts at level 3; prop and exposed foundation growth starts at level 5. Ground height stays below 0.18 world units to keep infantry readable. Doors and windows retain their apertures; the art adds no collision or cover.

![Connected strands and curved shell blades around a generated building](../diagnostics/infestation/temperate-level-10-detail.png)

### How adjacent tiles merge

`infestation_network.py` authors a periodic **6 × 6 tile** network from irregular, warped cells, a winding main artery and tapered branches. `infestation-ground-a.glb` carries its `Mature` morph target; Ground B is the independently validated mature review model. There is one continuous composition across 36 cells rather than a repeated one-tile mound. The seed chooses its phase and rotation, shared across the map.

The renderer matures that composition once, bins its triangles by cell, then slices out the footprint owned by each marked tile. Neighbours retain identical edge positions, heights and UVs, including at the six-tile wrap. Missing neighbours trim and flatten the exposed fringe. A shortened ramp samples the corresponding portion of the web instead of squeezing a whole tile. World orientation stays fixed while the skin is projected onto the rotated support underneath. Explicit ramp and stair links keep seams joined across a full storey rise.

This ownership split preserves fog, floor cuts and demolition. Repeated slices and support profiles share cached geometry and instanced batches. All ground colours sample the existing bug atlas through one skin material, avoiding a separate draw per palette colour. The network remains periodic at six tiles; architecture, elevation, patch boundaries and the seeded phase break up its repetition in the map.

## Dial and movement

| Level | Eligible tiles marked | Treatment |
|---:|---:|---|
| 0 | 0% | Existing map generation and art |
| 1 | 2.5% | Fine roots and small patches |
| 2 | 6% | Wider strands |
| 3 | 13% | Patches begin wrapping walls |
| 4 | 24% | Established shell pockets |
| 5 | 38% | Ground joins cliffs, foundations and prop bases |
| 6 | 52% | Majority coverage, heavier shell |
| 7 | 66% | Connected hive territory |
| 8 | 80% | Remaining clean areas become islands |
| 9 | 91% | Almost consumed |
| 10 | 98% | Thick web and shell growth throughout |

Coverage is a fraction of non-water tiles outside the landed dropship hull, rounded down to whole tiles. Floors and roofs participate. A dedicated seeded noise field ranks tiles; the same ranking at every level makes growth monotonic. None of the terrain, buildings, props, connectors or hooks rerolls when the dial changes. These percentages are initial tuning in `src/mapgen/data/infestation-tuning.ts`.

New mission offers snapshot `ceil(clamp(city infestation, 0, 100) / 10)`: 0 stays clean, 1–10 maps to level 1, and 91–100 to level 10. Missing fields on older mission offers and maps remain clean. The map's additive `infested: true` marker survives normal JSON saves without a schema migration.

Entering a marked tile costs **2 movement distance**, versus **1** on clean ground. For example, a unit with 6 distance per action crosses 3 infested tiles in one action. Pathfinding chooses the least expensive legal route, so a longer clean route can beat a shorter infested one. The move bands, action wheel, command validation, interrupted-move AP charge and AI projections share the rule. All units, including bugs, use it; multi-tile units pay twice once if any destination cell is infested. Clean arrivals cost one even when departing resin. Existing connector and collision rules still apply.

## In-game checks

| Snow | Desert |
|---|---|
| ![Snow at level 10](../diagnostics/infestation/snowy-level-10.png) | ![Desert at level 10](../diagnostics/infestation/desert-level-10.png) |
| **Coastal** | **Floor cut** |
| ![Coastal map with water left clear](../diagnostics/infestation/coastal-level-10.png) | ![Resin follows the selected floor cut](../diagnostics/infestation/temperate-level-10-cutaway.png) |

![Deployed units remain visible on the level-10 map](../diagnostics/infestation/tactical-level-10-move-range.png)

Sloped tiles, shortened ramps, stairs and pitched roofs fit the authored skin to the actual rendered support. Fitted geometry is cached by support shape and shared by instanced batches. Ground skins remain solid; walls and collars inherit ghost cutaway eligibility. Shells retain their support's fog ownership, floor level and demolition identity. Deploy and movement markers clear the resin surface.

## Authored kit

The kit is built from `tools/art/models/infestation_parts.py` and `infestation_network.py` through the six wrapper scripts. All GLBs use the existing bug atlas and pass the watertight/base/budget validator. The connected ground source has a 9,000-triangle allowance across 36 tiles (250 per tile before runtime slicing); vertical overlays have a 1,700-triangle allowance and collars 450. These are separate overlay budgets; the underlying terrain and building assets are unchanged. Ground A includes the morph data and remains under the 500 KiB asset cap.

| Model | Triangles | 45° | 135° | 225° |
|---|---:|---|---|---|
| Ground A + growth morph | 7744 | [render](../renders/infestation.resin.ground-a_045.png) | [render](../renders/infestation.resin.ground-a_135.png) | [render](../renders/infestation.resin.ground-a_225.png) |
| Mature review endpoint | 7744 | [render](../renders/infestation.resin.ground-b_045.png) | [render](../renders/infestation.resin.ground-b_135.png) | [render](../renders/infestation.resin.ground-b_225.png) |
| Wall | 1528 | [render](../renders/infestation.resin.wall_045.png) | [render](../renders/infestation.resin.wall_135.png) | [render](../renders/infestation.resin.wall_225.png) |
| Window | 1328 | [render](../renders/infestation.resin.window_045.png) | [render](../renders/infestation.resin.window_135.png) | [render](../renders/infestation.resin.window_225.png) |
| Door | 1096 | [render](../renders/infestation.resin.door_045.png) | [render](../renders/infestation.resin.door_135.png) | [render](../renders/infestation.resin.door_225.png) |
| Prop collar | 396 | [render](../renders/infestation.resin.collar_045.png) | [render](../renders/infestation.resin.collar_135.png) | [render](../renders/infestation.resin.collar_225.png) |

Regenerate one piece, substituting its wrapper, id, category and budget:

```sh
blender -b --python tools/art/make_model.py -- \
  --script tools/art/models/infestation-ground-a.py \
  --id infestation.resin.ground-a --category tiles \
  --file infestation-ground-a.glb --quality final --max-triangles 9000
```

Regenerate the Map Lab gallery with `node tools/art/preview/capture-infestation.mjs`; URLs, counts and browser errors are recorded in [captures.json](../diagnostics/infestation/captures.json). The recorded timings include regeneration and PNG readback under SwiftShader. Capture the deployed squad with `CAPTURE=1 pnpm exec playwright test e2e/infestation-movement.spec.ts --workers=1`.

Automated coverage includes all 11 levels, unchanged level-0 maps, nested growth, all biomes, deterministic serialization, mission meter conversion, weighted routes/AP/interruption/connectors/footprints, shared strand seams and wrap boundaries, concave fringes, growth morph identity, visible sparse cells, rotated-support fitting, and Map Lab URL/regeneration/floor-cut behavior. The tactical browser test launches a real level-10 mission, spends two AP on a route that would cost one on clean ground, and reloads the saved mission.
