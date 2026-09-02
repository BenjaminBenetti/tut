# ADR 0004: Tactical map contract and generation pipeline

- **Status:** Proposed
- **Date:** 2026-09-02
- **Author:** MapGen (Map Generation Specialist)
- **Numbering note:** 0001–0003 are reserved by #11 (toolchain, layering, state/command); this is 0004.
- **Reviewers:** Tech Lead (architecture sign-off), Director (touches `architecture.md` §5)
- **Scope:** `src/mapgen/` model and pipeline; the `TacticalMap` type consumed by `tactical/` and `graphics/`

## 1. Context

`docs/design/architecture.md` §5 sketches the map contract as
`TacticalMap { width, depth, levels, tiles[], buildings[], hooks{deployZones, objectives, edgeSpawns, extraction} }`.
`docs/design/gdd.md` §7 requires a seeded, parameterised generator that produces a 3D tile grid with
ground elevation, floor types, walls, cover, roads, props, **enterable multi-floor buildings** connected by
stairs/ladders, mech-vs-infantry passability, and placement hooks for missions.

Three domains depend on this type: `mapgen` produces it, `tactical` runs movement/LOS/cover on it, and
`graphics` renders it. Later milestones add hive layouts (M3), crash sites (M3) and a space platform (M4),
so the model must not assume "buildings on terrain" is the only shape a map can take.

This ADR fixes (a) the data model and its invariants, (b) the traversal rules tactical must implement so
that mapgen's connectivity guarantees mean something, and (c) the shape of the generation pipeline.

## 2. Decision summary

1. **Sparse tile records, not a dense voxel grid.** `tiles[]` holds one `Tile` per *standable surface*
   (ground, floor, roof, stairs). Air and solid rock are implicit. A map of 64×64 with a dozen buildings
   is roughly 5–8k records: plain JSON, readable in tests, cheap to index.
2. **Uniform vertical levels.** `y` is an integer level index (one level ≈ one storey). Ground elevation,
   building floors and roofs all live on the same level axis. `levels` is the exclusive upper bound of `y`.
3. **Thin walls on tile edges** (`n/e/s/w`), each `solid | window | door`. Walls are stored on both
   adjacent tiles; symmetry is an invariant.
4. **All vertical movement is explicit.** A `Connector` record (`ramp | stairs | ladder`) is the *only*
   way to change `y`. No connector ⇒ cliff. This makes connectivity a property mapgen can prove.
5. **Passability is a per-tile bitmask** (`INFANTRY | MECH`), denormalised by the final pass. Tactical
   never re-derives "can a mech stand here" from geometry.
6. **Props occupy tiles and provide cover.** Cover is a property of *what occupies a tile*
   (`coverProvided`), and tactical derives directional cover for a unit from adjacent tiles and walls.
7. **Buildings are records over tiles.** A `Building` owns floors, rooms, entrances and its connectors;
   interior tiles point back at it. Roof tiles exist only when the roof is walkable.
8. **Hooks are typed records keyed by a string `kind`.** The four groups from the architecture brief stay;
   each entry is a `Hook` with `kind`, `tiles`, `requiredPass` and optional metadata. New hook kinds are
   new data + a new placer pass, never edits to the model.
9. **`TacticalMap` is a derived artifact; `MapRecipe` is the saved state.** Saves store
   `{ seed, params }`, not the map. The generator is deterministic, so this is lossless.
10. **Generation is a linear pipeline of `GenerationPass` objects** over a mutable `MapDraft`, with each
    pass drawing from a *labelled fork* of the injected RNG. Archetypes (`settlement` now; `hive`,
    `crash-site`, `platform` later) are just different pass lists.

## 3. Coordinate system

```
            y (level, up)
            │
            │      ┌───────────┐  y = 3  roof (walkable if flat)
            │      │  floor 2  │  y = 2
            │      │  floor 1  │  y = 1
   ─────────┼──────┤  floor 0  ├──────────  y = 0  ground elevation here is 0
            │      └───────────┘
            └──────────────────────── x (width, east →)
           ╱
          z (depth, south ↓)
```

- `x ∈ [0, width)`, `z ∈ [0, depth)`, `y ∈ [0, levels)`.
- Directions: `n = -z`, `s = +z`, `e = +x`, `w = -x`. Diagonal movement is a tactical rule, not a map
  property; mapgen guarantees connectivity using orthogonal moves only.
- `y` is a **level**, not metres. Graphics decides how tall a level is (one storey). Ground terrain is
  quantised to whole levels; a one-level ground step is a wall-height ledge and is a cliff unless a `ramp`
  connector crosses it.
- Tile key for indexing: `key = (y * depth + z) * width + x`.

## 4. Data model

All types below are plain data: no classes, no methods, JSON-serialisable. IDs are short strings unique
within one map (`"b3"`, `"c12"`, `"hook-deploy-0"`). Names are the ones the implementation will use.

### 4.1 Primitives

```ts
// src/mapgen/model/tile-coord.ts
export interface TileCoord { readonly x: number; readonly y: number; readonly z: number }

export type Direction = 'n' | 'e' | 's' | 'w';

// src/mapgen/model/pass-mask.ts
/** Bitmask of unit classes that may occupy a tile or use a connector. */
export const PassMask = { NONE: 0, INFANTRY: 1, MECH: 2, ALL: 3 } as const;
export type PassMask = number;

// src/mapgen/model/cover.ts
export const CoverLevel = { NONE: 0, LOW: 1, HIGH: 2 } as const;
export type CoverLevel = 0 | 1 | 2;
```

### 4.2 Surfaces, walls, tiles

```ts
// src/mapgen/model/surface.ts
/**
 * Surfaces are data-defined so a biome can add one without touching model code.
 * Well-known ids are exported as constants from src/mapgen/data/surfaces.ts.
 */
export type SurfaceId = string;
export interface SurfaceDefinition {
  readonly id: SurfaceId;            // 'grass' | 'dirt' | 'sand' | 'snow' | 'rock' | 'road' | 'sidewalk'
                                     // | 'water' | 'floor' | 'roof' | 'stairs' | ...
  readonly defaultPass: PassMask;    // water → NONE, floor → INFANTRY, grass → ALL
  readonly isInterior: boolean;      // floor/stairs are interior; used for LOS/lighting hints
}

// src/mapgen/model/wall.ts
export type WallKind = 'solid' | 'window' | 'door';
export interface WallSet {
  readonly n?: WallKind; readonly e?: WallKind; readonly s?: WallKind; readonly w?: WallKind;
}

// src/mapgen/model/tile.ts
export interface Tile {
  readonly x: number; readonly y: number; readonly z: number;
  readonly surface: SurfaceId;
  /** Who may stand here. Denormalised by the finalize pass from surface, props, walls and buildings. */
  readonly pass: PassMask;
  /** Thin walls on this tile's edges. Mirrored on the neighbour (invariant I3). */
  readonly walls: WallSet;
  /** Prop occupying this tile, if any. An occupied tile is never passable. */
  readonly propId?: string;
  /** Cover this tile grants to units on adjacent tiles. Denormalised from the prop. */
  readonly coverProvided: CoverLevel;
  /** Set on interior floor, stair and roof tiles. */
  readonly buildingId?: string;
  readonly floorIndex?: number;
  readonly roomId?: string;
}
```

Why sparse records: a dense `Uint8Array` per attribute is faster for pathfinding but is not JSON-friendly,
and at our sizes (≤ 96×96×10) the difference is irrelevant. A read-only `TileIndex` helper
(`src/mapgen/service/tile-index.ts`) builds a `Map<key, Tile>` plus per-column lists so consumers get
O(1) lookups without the model carrying a class. If profiling in M2 says otherwise, the index can grow
typed-array caches without changing the contract.

### 4.3 Vertical connectors

```ts
// src/mapgen/model/connector.ts
export type ConnectorKind = 'ramp' | 'stairs' | 'ladder';

/**
 * The only way to change level. Always bidirectional.
 *   ramp   : ground ↔ ground, to.y === from.y + 1, horizontally adjacent, PassMask.ALL
 *   stairs : floor  ↔ floor,  to.y === from.y + 1, horizontally adjacent, PassMask.INFANTRY
 *   ladder : ground/roof ↔ roof, to.y >= from.y + 1, horizontally adjacent (across a wall), INFANTRY
 */
export interface Connector {
  readonly id: string;
  readonly kind: ConnectorKind;
  readonly from: TileCoord;   // lower tile
  readonly to: TileCoord;     // upper tile
  readonly pass: PassMask;
  readonly buildingId?: string;
}
```

Stairs geometry (side view). The stair tile is walkable at the lower level; the cell directly above it is
the stairwell hole (no tile), and the connector lands on the horizontally adjacent upper tile:

```
   y+1   [floor][floor][ to ][hole ][floor]
                              ▲
   y     [floor][floor][floor][from ][floor]     from.surface = 'stairs'
                              stairs
```

Ramps are drawn by graphics as a sloped face on the shared edge; both tiles stay flat. Ladders are drawn
on the wall face between `from` and `to`.

### 4.4 Props and cover

```ts
// src/mapgen/model/prop.ts
export type PropId = string;           // data-defined: 'car', 'crate', 'tree-pine', 'boulder', 'fence', ...
export interface Prop {
  readonly id: string;
  readonly kind: PropId;
  readonly tile: TileCoord;            // the tile it occupies (one tile per prop in M1.5)
  readonly rotation: 0 | 1 | 2 | 3;    // quarter turns, for graphics
}
export interface PropDefinition {      // src/mapgen/data/props.ts
  readonly id: PropId;
  readonly cover: CoverLevel;
  readonly blocksLos: boolean;
  readonly biomes?: readonly string[]; // restrict to biomes; undefined = any
}
```

Directional cover for a unit standing on `T` facing direction `d` is a **tactical** rule computed from
`T.walls[d]` (solid/window ⇒ high cover; door ⇒ none) and `neighbour(T, d).coverProvided`. Mapgen only
guarantees the data is consistent (I2, I3).

### 4.5 Buildings

```ts
// src/mapgen/model/building.ts
export interface Rect { readonly x: number; readonly z: number; readonly w: number; readonly d: number }

export interface Room {
  readonly id: string;
  readonly floorIndex: number;
  readonly rect: Rect;
  readonly kind?: string;              // 'hall' | 'office' | 'storage' — flavour for later passes
}

export interface Floor {
  readonly index: number;              // 0 = ground floor
  readonly y: number;                  // groundLevel + index
  readonly rooms: readonly Room[];
}

export interface Entrance {            // exterior door, denormalised from wall segments
  readonly tile: TileCoord;            // interior tile just inside the door
  readonly side: Direction;            // wall the door is on
}

export interface Building {
  readonly id: string;
  readonly kind: string;               // data-defined template id: 'house', 'shop', 'warehouse', 'tower'
  readonly footprint: readonly Rect[]; // union of rects; M1.5 emits one rect, model allows L/T shapes
  readonly groundLevel: number;        // y of the terrain under the building (lots are flattened)
  readonly floors: readonly Floor[];   // length ≥ 1
  readonly roof: { readonly kind: 'flat' | 'pitched'; readonly walkable: boolean };
  readonly entrances: readonly Entrance[];   // length ≥ 1
  readonly connectorIds: readonly string[];  // stairs/ladders that belong to this building
}
```

Interior tiles are `surface: 'floor'` (or `'stairs'`) with `buildingId` set and `pass` restricted to
`INFANTRY`. A walkable flat roof contributes `surface: 'roof'` tiles at `y = groundLevel + floors.length`
reachable by a ladder or a stair to roof; `levels` must include that level.

### 4.6 Placement hooks

```ts
// src/mapgen/model/hook.ts
export type HookKind = string;         // 'deploy' | 'egg-spawner' | 'edge-spawn' | 'extraction' | later: 'hive-core', 'crash-site', 'vip', ...

export interface Hook {
  readonly id: string;
  readonly kind: HookKind;
  readonly tiles: readonly TileCoord[];       // ≥ 1; zones list every tile, point hooks list one
  readonly requiredPass: PassMask;            // which classes must be able to reach it (I6)
  readonly meta?: Readonly<Record<string, number | string | boolean>>;
}

export interface PlacementHooks {
  readonly deployZones: readonly Hook[];      // ≥ 1; kind 'deploy'
  readonly objectives:  readonly Hook[];      // kind per mission type; ≥ what the recipe demanded
  readonly edgeSpawns:  readonly Hook[];      // ≥ 1; kind 'edge-spawn'; tiles on the map boundary
  readonly extraction:  Hook;                 // kind 'extraction'; may share tiles with a deploy zone
}
```

The four groups are kept because tactical and UI address them by role. Extensibility lives in `kind`
plus `meta` (e.g. egg spawner `{ hatchRadius: 3 }`), and in the pipeline's hook-placer registry (§6.4).

### 4.7 Root type and recipe

```ts
// src/mapgen/model/map-recipe.ts
export type BiomeId = string;                       // 'temperate' | 'snowy' | 'desert' | 'coastal' | ...
export type SettlementScale = 'rural' | 'town' | 'city';
export type MapArchetype = 'settlement';            // M3: 'hive' | 'crash-site'; M4: 'platform'
export type MapSizePreset = 'small' | 'medium' | 'large';   // 32², 48², 64² by default

export interface HookRequirement {
  readonly kind: HookKind;
  readonly count: number;                           // exact count the placer must satisfy
  readonly requiredPass: PassMask;
  readonly minDistanceFromDeploy?: number;          // manhattan tiles
  readonly meta?: Readonly<Record<string, number | string | boolean>>;
}

export interface MapGenParams {
  readonly archetype: MapArchetype;
  readonly biome: BiomeId;
  readonly settlement: SettlementScale;
  readonly size: MapSizePreset | { readonly width: number; readonly depth: number };
  readonly hooks: readonly HookRequirement[];       // from the mission type definition
}

/** What a save stores. Generating from the same recipe yields a deep-equal map. */
export interface MapRecipe {
  readonly seed: string;                            // hashed to the RNG's numeric state
  readonly params: MapGenParams;
}

// src/mapgen/model/tactical-map.ts
export interface TacticalMap {
  readonly version: 1;
  readonly recipe: MapRecipe;
  readonly width: number;
  readonly depth: number;
  readonly levels: number;
  readonly tiles: readonly Tile[];
  readonly buildings: readonly Building[];
  readonly connectors: readonly Connector[];
  readonly props: readonly Prop[];
  readonly hooks: PlacementHooks;
}
```

This extends the architecture brief's sketch with `connectors`, `props`, `recipe` and `version`.
`architecture.md` §5 should be updated to reference this ADR once accepted.

## 5. Traversal contract (what tactical must implement)

Mapgen's reachability guarantees are stated against this rule. Tactical may add costs, diagonals and
runtime state (closed doors, destroyed props) on top, but must not make a move legal that this rule
forbids, or the generator's promises are void.

```
canStep(unitClass, A, B):
  A.pass & unitClass  and  B.pass & unitClass          -- both standable for the class
  and (
    -- same level, orthogonal neighbour, no blocking wall on the shared edge
    A.y == B.y and adjacent4(A, B)
      and wallBetween(A, B) in { none, door }           -- doors are infantry-only
      and (wallBetween(A, B) != door or unitClass == INFANTRY)
    or
    -- level change through an explicit connector
    exists c in connectors: {c.from, c.to} == {A, B} and c.pass & unitClass
  )
```

A "cliff" (adjacent ground tiles with different `y` and no ramp) is impassable both ways. Dropping down
is deliberately **not** in the contract; if M2 wants it, it is additive and only widens reachability.

## 6. Invariants

Enforced by `validateTacticalMap()` (`src/mapgen/service/map-validator.ts`), which is run as the last
pipeline step and by every property test. Violations are hard errors: a generator that emits an invalid
map is a bug, never a runtime fallback.

| # | Invariant |
|---|---|
| I1 | Every tile is in bounds and `(x,y,z)` is unique. `levels` ≥ max `y` + 1. |
| I2 | A tile with `propId` has `pass == NONE`; its `coverProvided` equals the prop definition's cover. Every prop's tile exists and references it back. |
| I3 | Wall symmetry: `tile.walls[d]` equals `neighbour(d).walls[opposite(d)]` whenever the neighbour tile exists at the same `y`. |
| I4 | Every connector references two existing tiles with the kind's `Δy` and adjacency rule; `pass` matches the kind; stairs' `from` tile has `surface 'stairs'`. |
| I5 | Buildings: ≥ 1 floor, ≥ 1 entrance whose door wall exists; every floor tile lies inside the footprint and carries `buildingId`; every floor `i > 0` is reachable from floor 0 via the building's own connectors; interior and roof tiles are not mech-passable. |
| I6 | Hooks: every tile exists and satisfies `pass & requiredPass`; each edge-spawn tile lies on the map boundary; every deploy zone has ≥ 4 mech-passable and ≥ 8 infantry-passable tiles that are mutually connected per class. |
| I7 | Reachability: for each hook `h` and each class `c` in `h.requiredPass`, some tile of `h` is reachable under §5 from some tile of some deploy zone by class `c`. |
| I8 | Recipe satisfaction: for each `HookRequirement`, exactly `count` hooks of that kind exist, and `minDistanceFromDeploy` holds. |
| I9 | Determinism: `generate(recipe)` twice gives deep-equal maps (tested, not validated). |

## 7. Generation pipeline

### 7.1 RNG dependency

Mapgen depends on an **interface**, not an implementation. The implementation lives in `core/` per
`CLAUDE.md` and is scheduled to land with the tooling issue (#5). The interface mapgen needs:

```ts
// expected at src/core/model/rng.ts (Tech Lead's call on exact location)
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Weighted pick; weights need not sum to 1. */
  pickWeighted<T>(items: readonly T[], weight: (item: T) => number): T;
  /** Returns a shuffled copy. */
  shuffle<T>(items: readonly T[]): T[];
  /** A child RNG whose stream is a pure function of (this seed, label). */
  fork(label: string): Rng;
}
```

`fork(label)` is the important one. Each pass draws from `ctx.rng.fork(pass.id)`, so inserting or
reordering a pass, or changing how many numbers one pass consumes, does **not** perturb the others.
That keeps golden seeds stable while the generator is tuned and makes bisecting a bad map tractable.

If the #5 RNG lacks `fork(label)`, MapGen will open a small follow-up PR adding it (hash the parent
seed with the label to derive the child state) rather than working around it inside `mapgen/`.

### 7.2 Pass interface and context

```ts
// src/mapgen/model/generation-pass.ts
export interface GenerationContext {
  readonly params: ResolvedMapGenParams;   // presets expanded: width/depth numbers, biome + settlement defs
  readonly rng: Rng;                       // already forked for this pass
  readonly draft: MapDraft;                // mutable working state
  readonly registries: MapGenRegistries;   // surfaces, props, building templates, hook placers
  readonly diagnostics: DiagnosticSink;    // pass timings, notes, warnings for the preview harness
}

/** One step of the pipeline. Stateless; all state lives on the draft. */
export interface GenerationPass {
  readonly id: string;                                 // also the RNG fork label
  readonly requires: readonly DraftCapability[];       // e.g. ['heightmap', 'roads']
  readonly provides: readonly DraftCapability[];       // e.g. ['lots']
  run(ctx: GenerationContext): void;
}

export type DraftCapability =
  'heightmap' | 'water' | 'roads' | 'lots' | 'buildings' | 'props' | 'ramps' | 'hooks' | 'connected';
```

`MapDraft` (`src/mapgen/model/map-draft.ts`) is the mutable counterpart of `TacticalMap`: a dense
heightmap (`Int8Array` width×depth), a dense ground-surface layer, a road mask, a list of lots, and
growable `tiles/buildings/connectors/props/hooks` collections keyed for mutation. The finalize pass
freezes it into the plain `TacticalMap`.

The pipeline runner (`src/mapgen/service/pipeline-map-generator.ts`) validates `requires/provides`
ordering up front (fail fast with a message naming the offending pass), runs each pass with a labelled
RNG fork, records diagnostics, then runs `validateTacticalMap`.

```
 MapRecipe ─► resolve params ─► ┌──────────────────────────────────────────────┐
                                │ for pass in pipeline:                        │
                                │   assert pass.requires ⊆ provided-so-far     │
                                │   pass.run({ rng: root.fork(pass.id), ... }) │
                                │   provided ∪= pass.provides                  │
                                └──────────────────────────────────────────────┘
                                                      │
                                      finalize ─► validate ─► TacticalMap
```

### 7.3 Settlement archetype: pass order

| # | Pass id | Requires | Provides | What it does |
|---|---|---|---|---|
| 1 | `terrain` | – | `heightmap` | Value noise (permutation table seeded from the pass RNG) quantised to levels using the biome's amplitude; assigns ground surfaces from the biome palette. |
| 2 | `water` | `heightmap` | `water` | Coastal biome only: carves a shoreline along one map edge, tiles become `water` (impassable). No-op elsewhere. |
| 3 | `roads` | `heightmap`,`water` | `roads` | Road network by settlement scale (rural: one meandering road; town: main street + side streets; city: grid + alleys). Flattens terrain along roads. |
| 4 | `lots` | `roads` | `lots` | Parcels land adjacent to roads into rectangular lots sized by settlement scale; flattens each lot to one level. |
| 5 | `buildings` | `lots` | `buildings` | Picks a building template per lot (biome + settlement weights), emits floors, rooms, walls, doors, windows, stairs, roof access. |
| 6 | `props` | `buildings` | `props` | Vegetation and clutter from the biome's prop table; street props on roads; interior crates in storage rooms. Never blocks doors. |
| 7 | `ramps` | `props` | `ramps` | Ensures ground-level connectivity: BFS over ground columns; where a 1-level step separates components, emits ramps; ≥ 2-level steps stay cliffs (routes go around). |
| 8 | `hooks` | `ramps` | `hooks` | For each `HookRequirement`, resolves a `HookPlacer` from the registry and runs it (§7.4). |
| 9 | `connectivity` | `hooks` | `connected` | Checks I7. Repairs by, in order: removing a blocking prop, adding a door, adding a ramp, relocating the hook. Logs every repair to diagnostics so the preview shows them. |
| 10 | `finalize` | `connected` | – | Denormalises `pass` and `coverProvided`, computes `levels`, freezes the draft into `TacticalMap`, validates. |

Hive, crash-site and platform archetypes reuse `props`, `hooks`, `connectivity` and `finalize`
unchanged and swap the first six for their own passes (caverns, crater + debris, decks + void). That is
the Open/Closed argument for the pipeline shape.

### 7.4 Registries (Open/Closed extension points)

```ts
// src/mapgen/model/registries.ts
export interface MapGenRegistries {
  readonly surfaces: Registry<SurfaceDefinition>;
  readonly props: Registry<PropDefinition>;
  readonly biomes: Registry<BiomeDefinition>;
  readonly settlements: Registry<SettlementDefinition>;
  readonly buildingTemplates: Registry<BuildingTemplate>;
  readonly hookPlacers: Registry<HookPlacer>;
}

export interface HookPlacer {
  readonly kind: HookKind;
  place(req: HookRequirement, ctx: GenerationContext): void;   // pushes Hook(s) onto draft.hooks
}

// src/mapgen/data/biomes.ts (excerpt)
export interface BiomeDefinition {
  readonly id: BiomeId;
  readonly groundSurfaces: readonly { surface: SurfaceId; weight: number }[];
  readonly terrain: { amplitudeLevels: number; frequency: number; roughness: number };
  readonly hasShoreline: boolean;
  readonly vegetation: readonly { prop: PropId; density: number }[];
  readonly buildingKinds: readonly { template: string; weight: number }[];
  readonly roadSurface: SurfaceId;
}
```

Adding a biome is a new entry in `data/biomes.ts` (plus any new surfaces/props). Adding a hook kind is
a new `HookPlacer` registered in `data/hook-placers.ts`. Neither touches an existing pass.

### 7.5 File layout

```
src/mapgen/
  model/      tile-coord, pass-mask, cover, surface, wall, tile, connector, prop, building, hook,
              map-recipe, tactical-map, map-draft, generation-pass, registries
  data/       surfaces, props, biomes, settlements, building-templates, map-sizes, hook-placers
  generator/  terrain-pass, water-pass, road-pass, lot-pass, building-pass, prop-pass, ramp-pass,
              hook-pass, connectivity-pass, finalize-pass, placer/{deploy,egg-spawner,edge-spawn,extraction}
  service/    pipeline-map-generator, settlement-pipeline (factory), tile-index, reachability-service,
              map-validator, value-noise, ascii-map-renderer
```

`ascii-map-renderer` is pure TS and doubles as the fastest preview: one character per column per level,
used in tests and printable from a script. The graphical harness is a thin `graphics/` view over
`TacticalMap` plus a `ui/` screen with seed/param controls; it is added after the pipeline lands and
after the Tech Lead's screen router exists, and contains no generation logic.

## 8. Testing

- **Property tests** (`pipeline-map-generator.test.ts`): for N seeds × every biome × every settlement ×
  every size preset, generate and assert I1–I9 plus soft expectations (building count within the
  settlement's range; ≥ 1 building has ≥ 2 floors in town/city; every building interior reachable by
  infantry from a deploy zone).
- **Golden seeds**: a handful of `(seed, params)` pairs with a checksum of the ASCII render, so an
  unintended change in output is caught (and an intended one is a deliberate golden update).
- **Per-pass unit tests** beside each pass, run on a hand-built `MapDraft`.
- Determinism test: two `generate` calls deep-equal; forks: adding a no-op pass leaves other passes'
  output unchanged.

## 9. Consequences

- Tactical gets a small, explicit traversal rule (§5) and never has to infer geometry. Graphics gets
  everything it needs to draw (surfaces, walls, props, connectors, roofs) without game logic.
- Sparse tiles keep the model plain and debuggable; the `TileIndex` helper carries the fast paths.
- Explicit connectors make ledges cliffs by default. Maps will have more ramps than a free-climb model;
  the `ramps` pass controls density. This is a deliberate trade for provable connectivity.
- `TacticalMap` is not saved. Destructible terrain (M2+) will need either a diff log in mission state or
  a map codec; both are additive and out of scope here.
- Denormalised `pass`/`coverProvided` must be recomputed by any future runtime mutation (destruction).
  That belongs to whichever tactical service mutates the map.
- The pipeline's `requires/provides` check is deliberately simple (set inclusion, no scheduling). Pass
  order is authored, not solved.

## 10. Alternatives considered

- **Dense voxel grid with typed arrays.** Faster, smaller in memory, but not JSON-plain and harder to
  read in tests. Rejected for now; the `TileIndex` helper can adopt typed-array caches later without
  changing the contract.
- **Free climbing of 1-level steps.** Simpler generation, but every plateau edge becomes a slope and
  ledges lose tactical meaning. Rejected in favour of explicit ramps.
- **Half-level ground heights.** More natural terrain, but puts ground and floors on different axes and
  complicates every consumer. Rejected.
- **Cover as a per-tile directional field.** Precomputing `cover[n/e/s/w]` per tile duplicates data
  tactical can derive in one lookup and goes stale on any mutation. Rejected; only `coverProvided` is
  denormalised.
- **Walls stored once per edge (n/w only).** Halves duplication but every consumer needs the mirror
  lookup. Rejected for ergonomics; symmetry is validated instead.

## 11. Open questions for the Tech Lead

1. RNG: does `core/` ship an `Rng` with `fork(label)`? If not, MapGen will propose one (§7.1).
2. Grid primitives: #6 adds `Vec2/Vec3/GridPos` to `core/model`. If `GridPos` is `{x, y, z}` with
   integer `y` as the vertical axis, mapgen will alias `TileCoord = GridPos` instead of defining its own.
3. Should `SurfaceId`/`PropId` → material/mesh mapping live in a `graphics/data` manifest keyed by these
   ids? MapGen assumes yes and will not reference asset paths.
4. Preview harness entry: a second Vite HTML entry (`preview/mapgen.html`) vs. a screen in the router.
   MapGen prefers the second HTML entry so it never blocks on `app/` and can be opened by QA directly.
