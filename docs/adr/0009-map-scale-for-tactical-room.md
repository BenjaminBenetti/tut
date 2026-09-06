# ADR 0009: Map scale opens up for tactical room

- **Status:** Proposed (Tech Lead); becomes Accepted when the generation child ships.
- **Date:** 2026-09-06
- **Author:** Tech Lead
- **Requested by:** Executive Director (#826, from Map Lab play): *"the buildings are just too small. There's not enough internal space… the roads are one tile wide… just generally scale the map up so that there is more space to maneuver… make sure the max zoom level is higher."* His doubling and two-tile road are **illustrations, not a specification**; MapGen owns the factors.
- **Scope:** Architecture §5 (map contract, cameras); ADR 0004 §7 (pipeline); `mapgen/`, `graphics/` camera, Map Lab. **Not** ADR 0008: elevation layers are untouched.

## 1. Context

Everything horizontal in a map is sized in tiles (1 u = 2 m) by a handful of
knobs, and the knobs were chosen for a 32–64 tile board:

| knob | where | today |
| --- | --- | --- |
| map dimensions per size preset | `mapgen/data/map-sizes.ts` | 32² / 48² / 64² for small / medium / large |
| road lanes per style | `SettlementDefinition.roadWidth` | trail 1, streets 1, grid 2 (city only) |
| sidewalks | `SettlementDefinition.sidewalks` | one flanking column, town and city |
| grid block | `SettlementDefinition.blockSize` | 12 (city) |
| lot size | `lotWidth`/`lotDepth` | rural 5–8, town 4–7, city 3–6; `LOT_GAP = 1` |
| building footprint | `mapgen/data/building-templates.ts` | 3–8 × 3–8 per template, 1–5 floors |
| rooms | `interior/room-partitioner.ts` `minRoomSize` | BSP splits down to a few tiles per room; no corridors |
| prop and cover density | `streetPropDensity`, yard/interior densities | per 100 open columns |
| elevated features | `mapgen/data/elevated-features.ts` | footprints in tiles |
| hooks and spawns | #470, #443 | distances fitted to the map |
| camera zoom | `graphics/model/camera-state.ts` `CAMERA_ZOOM` | 40–128 px per tile, fixed |

At 40 px per tile a 64-tile map is 2,560 px wide: the far end of the zoom
cannot show a large map whole. The road pass fits junction and corner models
by neighbourhood for lanes of width 1 and, on the city grid, 2; nothing wider
has ever been drawn. Building interiors are partitions of a 3–8 tile
footprint, which is a room, not a building a squad fights through.

## 2. Decision

### 2.1 Scale is a set of knobs, not a multiplier

There is no global "×2". Every quantity in §1 stays an explicit, typed knob
in `mapgen/model` / `mapgen/data` (ADR 0003 §2.5), and **MapGen chooses the
values**, defending each with frames and stating what was tried. The reason
is the Executive Director's own: buildings must get *bigger as structures*,
which a multiplier cannot do, and roads need *manoeuvring width*, which is a
lane count. A change that reads well may scale the map by one factor, lots by
another and roads by a third.

### 2.2 What the generation child changes (MapGen decides the numbers)

1. **Map dimensions per size preset** grow; the preset ids stay. Larger maps
   are accepted (#826). Hook and edge-spawn distances already fit the map
   (#470, #443) and are re-verified, not re-tuned.
2. **Roads are carriageways**: `roadWidth` ≥ 2 for `streets` and `grid`, a
   sidewalk width knob, and the road pass's junction and corner fitting
   extended to the chosen widths so intersections and corners are clean. If
   the road model kit cannot express a width cleanly (kerb edges, centre
   lines), that is the art child's trigger (§3c) and is stated in the PR.
3. **Lots and footprints** grow with the road width and block size so a
   block still holds buildings; `LOT_GAP` and the raised-feature margin
   (#769) are revisited against the new lot sizes.
4. **Interiors become structures**: a target room size a squad can fight in,
   corridors joining rooms, doorways that are not the only cover, interior
   cover from the furnishing tables, stairs that lead somewhere. The
   partitioner gains a corridor concept and room-size targets as knobs; the
   furnishing tables gain interior cover. This is the part the Executive
   Director named twice and it is the one to spend the frames on.
5. **Prop and cover density** are re-expressed per area so bigger open ground
   does not read empty; elevated-feature footprints scale with lots.
6. **Map Lab**: a size readout (tiles, buildings, mean rooms per building,
   road lane widths) and an interior control — a building cut to one floor —
   next to the existing controls, all captured through
   `e2e/slope-screenshot.spec.ts`'s pattern.

### 2.3 Camera zoom is map-aware, sized as its own child

`CAMERA_ZOOM.min` becomes a function of the map and the viewport — the
smallest pixels-per-tile that still fits the whole map's diagonal in the
viewport, floored at a legibility limit — and `max` rises so a squad fills
the near end. The rig clamps as today; `CameraState` stays plain data. Map
Lab and the tactical screen both take it. This lands **first**: a bigger map
you cannot see is a regression, and the generation child's frames must be
judgeable at both ends.

### 2.4 Out of scope, by ruling

Gameplay balance (move budgets, sight ranges, wave pacing, hook distances as
gameplay); elevation (ADR 0008); tuning after the Executive Director plays it
(#826 says more passes follow).

### 2.5 Saves and goldens

No save migration: a mid-mission save carries its map inline at whatever size
it was generated (ADR 0004 §9) and the contract does not change shape; a
campaign save between missions carries no map. `MAP_SIZE_PRESETS` ids are
stable so `map.recipe` still reproduces a map within a build. Every golden
re-pins with the list. `test:sim` before and after is reported and **will
move**; #734 reads it as a moved baseline, not a regression.

### 2.6 Budgets, reported not capped

Generation time for the largest settlement (the pass log already prints per
pass) and frame rate on it at both zoom ends are stated with numbers in the
generation child's PR. If the largest city blows a budget, the PR says so and
the Director rules; the size is not quietly capped (#826).

## 3. Order of work (#826 children)

| # | child | owner / tier | what | lands |
| --- | --- | --- | --- | --- |
| a | **camera zoom range** | Opus seat, `complexity:medium`, `area:graphics` | §2.3: map-aware `min`, higher `max`, both screens; a test that a 96-tile map fits at min zoom in a 1280×720 viewport; before/after frames at both ends on the large city | first |
| b | **generation at the new scale** | MapGen, `area:mapgen` | §2.2 and §2.5–2.6: knobs chosen and defended; big city, rural and interior controls; junctions and corners; timing and frame rate; `test:sim` before/after | after a |
| c | **art for wide roads / larger cover** | Art Director, `area:art`, **filed only if b needs it** | kerb or edge variants for carriageways, centre lines, larger cover pieces — whatever b names as unexpressible with today's kit | parallel with b, on b's word |

The Director judges every frame before merge, and the Executive Director's
play decides the next pass.

## 4. Consequences

- Maps get larger and slower to generate; the budget is reported, not hidden.
- Balance shifts (movement, sight, pacing) and is deliberately left for a
  later pass with the Executive Director's steer.
- Road and interior fitting become width-aware, which every later road or
  building feature inherits; "one-tile road" assumptions in `lot-pass`
  (frontage detection by adjacent road column), `prop-pass` (street props on
  the flanking column) and `elevation-pass` (frontage strip) are the places
  that will break first and are named so the generation child finds them.
