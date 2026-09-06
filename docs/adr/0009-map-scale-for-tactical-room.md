# ADR 0009: Map scale opens up for tactical room

- **Status:** Accepted (#829 shipped the generation child; the factors it chose are in §5).
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

## 5. Factors chosen (#829, MapGen)

Recorded here so later passes react to numbers, not to a diff. Every one
is a knob in `mapgen/data/`; none is a multiplier.

| Knob | Was | Now | Why |
| --- | --- | --- | --- |
| Map presets small / medium / large | 32² / 48² / 72² | 48² / 72² / 96² | ×1.5 a side (×2.25 area) holds structures twice the size without the ×4 area that a doubled side costs every flood fill; 96 is what the camera child (#828) fits at its widest zoom. Ids unchanged. |
| Road lanes trail / streets / grid | 1 / 1 / 2 | 2 / 3 / 4 | A dirt track two abreast, a high street a mech and two soldiers wide, an avenue a full squad line can cross under fire. Every style lays its lanes, the grid no longer alone. |
| Sidewalk width town / city | 1 / 1 (boolean) | 1 / 2 | Pavement that reads as a strip beside a four-lane avenue, and the first cover-free band a squad crosses leaving a doorway. |
| City block pitch | 12 ± 2 | 26 ± 3 | Road 4 + pavement 2 + 2 leaves 18 columns for two rows of lots of depth 7 to 8 with the two-column gap between them. |
| Lot width × depth rural / town / city | 5–8 / 4–7 / 3–6 (square) | 10–16² / 8–14² / 7–12 × 7–10 | Doubled, so the doubled footprints below still leave a yard; city depth capped so both sides of a block get a row. Building counts are unchanged and now tuned against 72². |
| Lot gap, edge margin | 1, 1 | 2, 2 | A soldier passes between two houses without brushing both walls; the same for the map edge. |
| Footprints house / shop / warehouse / apartment / tower | 3–5² / 4–6×3–5 / 5–8² / 3–6² / 3–5² | 6–10² / 8–12×6–10 / 10–16² / 6–12² / 6–10² | Doubled, so a floor holds at least two rooms of the size below plus a corridor. |
| Room size (min–max edge) | one `minRoomSize` 2–4 | house 3–5, shop 4–7, warehouse 6–10, apartment / tower 3–5 | A fireteam of four plus cover in the smallest room; a shop floor and a warehouse bay open enough for a firefight. |
| Corridor width | none | house 1, apartment / tower 2, shop / warehouse 0 | The spine every room opens onto and every flight of stairs lands in; narrow houses get a hallway, blocks of flats a corridor two abreast, shops and warehouses stay open plan. |
| Interior cover (tiles per prop / max) hall / room / storage / corridor | 8/2, 6/2, 5/3, – | 7/3, 6/4, 4/8, 10/2 | A 4×5 room holds three pieces of cover, a bay up to eight, a corridor a crate. Every placement is still verified not to cut the building off. |
| Elevated feature footprints, densities per area | – | unchanged | Features are placed by attempts against the plat and already scale with it; per-100-column densities self-scale. Re-verified across the sweep, not retuned (balance is out of scope, #826). |
| Nearest egg spawner from deploy | random beyond 12 | **within 30** (`maxNearestDistanceFromDeploy`), the rest anywhere | Spawners drawn at random beyond a minimum drift outward with the board: on 72² a mech at its slowest needed 11–17 turns to its first shot on five of twelve shipped maps. A placement rule, not a count or wave change. |
| Tallest building | two floors guaranteed | **three** where the settlement allows three | A small city at this scale holds four or five buildings, so the biome weights alone no longer promise an apartment on every map. |

