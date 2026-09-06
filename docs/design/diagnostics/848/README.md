# #848: diagonal chains

Main comparison tree: `e671c01`, after #847/#853 and the ADR 0009 scale change.
Both sides use those same MapGen rules, seeds, settings and models. The after
side adds the diagonal kit and its neighbouring surface fit. Original
`Tile.slope` values remain unchanged; [the dump](neighbourhoods.json) records
all eight neighbours around each target and its resolved appearance.

[Six-panel composite](../../kits/diagonal-slopes-composite.png): two, three and
four steps in grass and snow, using the actual scene consumer. The chain's
new top is `RISE × (u + v) / 2`, with `RISE = 0.75` shared with the other three
slope models. [Contract and three angles](../../kits/terrain-slopes.md).

## Same-seed frames

All controls use `slope=100&models=1&units=1`, full colour in Map Lab, 140 screen
pixels per tile and an 800 × 660 crop centred on the stated tile. No props,
walls or textures were hidden for the comparison. The snowy four-chain passes
under trees; the composite shows four steps without that occlusion.

| Control | Seed / biome / settlement / size | Centre `(x,y,z)` | Before | After |
| --- | --- | --- | --- | --- |
| Three, SE high | `qa813-snowy-rural-large-1` / snowy / rural / large | `(11,4,11)` | [frame](before/snowy-three-se.png) | [frame](after/snowy-three-se.png) |
| Three, NW high | same | `(23,3,46)` | [frame](before/snowy-three-nw.png) | [frame](after/snowy-three-nw.png) |
| Three, SW high | `hunt-temperate-large-1` / temperate / rural / large | `(21,1,4)` | [frame](before/grass-three-sw.png) | [frame](after/grass-three-sw.png) |
| Mixed turns | `hunt-temperate-large-3` / temperate / rural / large | `(53,1,4)` | [frame](before/grass-mixed-three.png) | [frame](after/grass-mixed-three.png) |
| Four, NE high | `qa813-snowy-town-large-0` / snowy / town / large | `(24,3,90)` | [frame](before/snowy-four-ne.png) | [frame](after/snowy-four-ne.png) |
| Isolated outer S2 | `qa813-temperate-rural-large-0` / temperate / rural / large | `(52,2,32)` | [frame](before/isolated-outer-s2.png) | [frame](after/isolated-outer-s2.png) |
| Three-high slot J3 | `hills-1` / snowy / rural / medium | `(10,3,29)` | [frame](before/three-high-j3.png) | [frame](after/three-high-j3.png) |

The two snowy three-chains, the grass SW chain and the snowy NE four-chain
resolve entirely to the new plane. The mixed sequence is `outer-1, outer-3,
outer-3`; its first tile points the other way and keeps the existing corner.
Only the aligned final pair forms a monotone diagonal chain. Isolated S2
retains the outer model. Its before/after PNGs are byte-identical.

## Broader fit boundary

A fresh [108-map sweep](sweep.json) uses all four QA biomes, three settlements,
three sizes and `qa813-<biome>-<settlement>-<size>-{0,1,2}` on the current tree.
It finds 21 **aligned** chains (47 tiles); 18 chains / 41 tiles fit the plane
and its flanks. No isolated corner changes. This counts matching high
orientations, unlike the catalogue's broader diagonal adjacency count.

Three chains deliberately retain the old corner because their side vertex
already faces a cliff or retaining wall:

| Seed | Chain start | Incompatible neighbour |
| --- | --- | --- |
| `qa813-temperate-rural-medium-1` | `(21,2,67)` | `(20,1,67)`, a lower bare cliff |
| `qa813-snowy-town-medium-0` | `(32,4,10)` | `(32,4,12)`, a walled cliff |
| `qa813-snowy-town-large-2` | `(69,4,62)` | `(68,6,62)`, ground above the proposed plane |

Fitting these would reshape an existing cliff/retaining boundary. They are
outside this continuous-surface fit, and remain visibly eligible for a later
boundary-design decision. The raw vertex heights and neighbours are in the
sweep report. Regression tests preserve both higher and lower cliff cases.

## #849 check

The hills-1 tile `(10,3,29)` is rock, has no slope and faces three higher
orthogonal neighbours (north, south, west in the current dump). A single
monotone diagonal plane has one low and one high corner; it cannot meet
three raised sides while retaining a low opening. The new fit places no
diagonal or transition cap on this map. The slot remains visible in the
control, with byte-identical before/after PNGs. It needs a separate shape
decision; none is included here.

## Reproduce

Run Vite on each tree in turn, then capture its side from the repository
root (the script may be copied from this branch for the baseline):

```bash
CAPTURE_BASE_URL=http://localhost:4173 node tools/art/preview/capture-diagonal-controls.mjs before
CAPTURE_BASE_URL=http://localhost:4173 node tools/art/preview/capture-diagonal-controls.mjs after
CAPTURE=1 pnpm exec playwright test e2e/diagonal-slope-screenshot.spec.ts
```

The script waits for models and two rendered frames after each camera input.
It records the seed, centre, measured pitch and screen projection in each
side's `captures.json`; matching completed entries are resumable. To re-shoot
a side, move its previous directory aside first. This is a real scene capture,
not a rendered image edited to demonstrate the proposed change.

## Validation

The three-angle Blender/trimesh loop validates the new 10-triangle, 1,932-byte
mesh. The composite and all fourteen comparison crops were opened and judged
locally. Typecheck, lint, 2,030 unit tests (one skipped) and build pass; the browser suite passes
59 tests with 23 opt-in captures skipped and zero retries. Both seed-4242 fog
frames were regenerated, opened and are byte-identical to main.

[Hashes for the unchanged S2, J3 and fog controls](control-hashes.json).
