# ADR 0008: Elevation is measured in half-height layers

- **Status:** Accepted (engine conversion, #807); natural half-step generation and slope art follow as children b/c.
- **Date:** 2026-09-06
- **Author:** Tech Lead
- **Requested by:** Executive Director (#804, from Map Lab play): *"the height change is too big. We should allow half-height jumps, or basically make layers half the height … be careful because many items will need to be adjusted to be two layers tall."*
- **Scope:** Architecture §2 (determinism, serialisable state), §5 (map contract); ADR 0004 §3–§6; `mapgen/`, `tactical/`, `graphics/`, `save/`, the art kit.

## 1. Context

Today `Tile.y` counts **levels**, one level is one storey, and one storey is
`LEVEL_HEIGHT = 1.5` world units (a tile is 1 u = 2 m). Every vertical
quantity is built on that: terrain amplitude (`amplitudeLevels` 1–3 per
biome), connector rise (`minRise = maxRise = 1`), the eye (`EYE_HEIGHT = 0.5`
level), the elevation bonus (`elevationPerLevel = 10` per level of `y`
difference), sight blocking (`tile.y > level`), building floors, wall and
stairs models (1.5 u), `tileTop(y) = y × 1.5 + slab`. A natural hillside
therefore steps a full storey per tile, which #799/#801 dressed as a wedge but
could not make gradual.

## 2. Decision

### 2.1 The unit: a layer is half a storey

| quantity | old | new |
| --- | --- | --- |
| tile | 1 u (2 m) | 1 u (2 m), unchanged |
| **`Tile.y` unit** | level = 1 storey | **layer = ½ storey** |
| world height per unit of `y` | `LEVEL_HEIGHT = 1.5` | **`LAYER_HEIGHT = 0.75`** |
| a storey | 1 level | **`STOREY_LAYERS = 2`** |
| `TacticalMap.levels` (exclusive bound of `y`) | storeys | layers (doubles) |
| eye height | 0.5 level (0.75 u) | **1 layer** (0.75 u, unchanged) |
| wall, door, window, stairs models | 1.5 u tall | 1.5 u, unchanged — they span 2 layers |
| half wall, parapet models | 0.5 u | 0.5 u, unchanged |
| slope wedge rise (#798 `RISE`) | 1.5 u | **0.75 u** |

`LEVEL_HEIGHT` is deleted, not aliased: every consumer chooses `LAYER_HEIGHT`
or `STOREY_LAYERS × LAYER_HEIGHT` explicitly, so nothing keeps meaning "one
storey" by accident. World-unit constants that were never levels (fog sheets,
overlay lift, slab thickness, prop footprints) do not change.

### 2.2 Inventory of what doubles (in `y`) so that nothing changes on screen

Everything man-made spans two layers where it spanned one level:

- **mapgen**: graded plats, elevated features (plaza, podium, embankment,
  rubble mound, terrace), lot grading, building floors (`floorIndex k` sits
  at `y = base + 2k`), roofs, ramp/stairs/ladder rises (`minRise = maxRise = 2`;
  ladder `minRise = 2`), `amplitudeLevels` → `amplitudeLayers` (×2 for now).
- **tactical**: unit `y`, hook coordinates, `TileKey` encoding (`levels` is a
  factor), `EYE_HEIGHT` in layers, elevation and sight thresholds (§2.4).
- **graphics**: `tileTop`, ground pillars (`y × LAYER_HEIGHT`), level groups
  (one per layer; the Levels slider steps in storeys), camera offsets that
  assumed a storey, `unexplored-fog` sheet placement per populated layer.
- **art**: the slope set only (§2.1). No wall, prop or unit model changes: a
  storey is still 1.5 u.
- **Map Lab**: the Levels slider, the ASCII renderer's level glyphs, the
  step-distribution readout (§2.5).

### 2.3 Traversal

1. **A one-layer step is a free walk.** Orthogonal neighbours with `|Δy| ≤ 1`
   are mutually reachable for both classes at normal move cost, in every
   direction, with no connector. This is the one new rule and it is the
   *only* implicit vertical move; it lives in `ReachabilityService`, which
   movement, hooks, the sweep and the bug AI already share.
2. **Two or more layers need a connector**, exactly as ADR 0004 §3.4 says
   today: ramp (man-made, rise 2), stairs (rise 2), ladder (rise ≥ 2). *No
   connector ⇒ cliff* keeps holding for every `|Δy| ≥ 2`.
3. **Natural terrain never needs a connector.** Mapgen guarantees a natural
   step is at most one layer per tile (§2.5), so the `slope` connector kind
   (#801) is **retired**: the `Tile.slope` attribute stays as the *shape* of a
   natural one-layer step (kind, turns, for the wedge and the metric), and
   reachability comes from rule 1. One fact, one derivation.
4. **Man-made edges keep their walls** (#789, #801 I10). A raised plaza is two
   layers with a parapet and a ramp; a half step never appears at a man-made
   edge.

### 2.4 Combat and sight

- **Elevation bonus threshold is one storey.** `elevationBonus(from, to)` =
  `trunc((from.y − to.y) / STOREY_LAYERS)` storeys, × `elevationPerLevel`
  (renamed `elevationPerStorey`). A bare half step gives no bonus either way.
- **Line of sight uses real height in layers**: the eye at `y + 1` layer, the
  ray sampled in layers; a column blocks when a tile's `y` exceeds the ray's
  height at that point, as now. A half-step ledge therefore blocks sight only
  when the geometry says so; it grants **no cover** (cover stays a property of
  walls and props — ADR 0004 §3.6). "Low cover from a half ledge" is a
  follow-up, not this.
- `EYE_HEIGHT = 1` (layers). `test:sim` is the balance check: with §2.2 applied
  and no natural half steps yet, every mission is geometrically identical and
  the difficulty table must not move; the mapgen child then reports the table
  again when half steps appear.

### 2.5 Mapgen rules for natural terrain (the visible change)

- Terrain amplitude is expressed in layers (`amplitudeLayers`, default the old
  value × 2 so hills keep their height).
- **Smoothing invariant I11**: after the terrain pass, no two orthogonally
  adjacent natural ground columns differ by more than one layer. Pinned in
  the sweep.
- Every natural one-layer step gets a `Tile.slope` on its lower tile (kind
  and turns as #801; `slopeShare` still decides per run whether it is
  sloped or left a bare half step — both are walkable now; the knob is
  visual). The `naturalEdge` marker stays for the metric.
- Map Lab adds a **step distribution** readout: counts of ground edges by
  `|Δy|` (0, 1, ≥2) so MapGen and the Executive Director can see how gradual a
  map is.

### 2.6 Migration

- `TACTICAL_MAP_VERSION` → **2**. `GAME_STATE_SCHEMA_VERSION` → **16** with a
  migration that, for an `activeMission` carrying a v1 map: doubles every `y`
  (tiles, `levels`, walls' tiles, connectors, hooks, props, unit positions,
  `lastSeen`), re-encodes every `TileKey` in `vision.visible/explored` with the
  doubled `levels`, doubles connector rises, and converts legacy `slope`
  connectors into `ramp` connectors of rise 2 (traversal preserved; the wedge
  is dropped, a plank placeholder shows for that old mission only). Saves
  between missions carry no map and need nothing beyond the version line.
- Mapgen goldens re-pin (every `y` doubles); the ASCII renderer prints layers.
- The model manifest's `height` fields are world units and do not change.

## 3. Order of work (#804 children)

| # | child | owner / tier | what | lands |
| --- | --- | --- | --- | --- |
| a | **engine unit change** | `eng-3`, `complexity:high` | §2.1, §2.2, §2.3 rules 1–3 (free half step, connector rises 2, `slope` connector retired), §2.4, §2.6; mapgen emits doubled `y` for everything with **no natural half steps yet**; goldens re-pinned; `test:sim` table identical; both fog frames and the two #799 controls byte-identical or the diff explained | first |
| b | **mapgen half steps** | MapGen, `area:mapgen` | §2.5: `amplitudeLayers`, I11 smoothing, slope tiles without connectors, step readout, `test:sim` before/after, controls regenerated | after a |
| c | **art: slope set at half rise** | Art Director, `area:art` | re-emit the #798 slope family with `RISE = 0.75` (the one parameter), composite render on a two-material terrace | parallel with b; b uses the placeholder wedge until c lands |

The Director judges the frames of b and c before merge (#804 acceptance).

## 4. Consequences

- Hills read as gradual half steps; a storey of building is unchanged on
  screen; nothing floats or sinks if §2.2 is complete — the engine child's
  byte-identical frames are the proof that it is.
- Seeds produce different maps once b lands (accepted pre-release, #804 §6).
- `y` is twice as large everywhere; anything that hard-codes `1` for "one
  storey" is a bug this ADR makes visible, which is the point of deleting
  `LEVEL_HEIGHT` rather than aliasing it.
- Retiring the `slope` connector removes a second derivation of natural
  walkability three days after it was added; the alternative (keeping rise-1
  connectors alongside the free-step rule) would let a bug in either mask the
  other.
