# Map generation pipeline

How a `MapRecipe` becomes a `TacticalMap`. Salvaged from the Map Generation Specialist's handoff on 2026-09-15; pass names match `src/mapgen/generator/`.

```
 MapRecipe ─► hashSeed ─► Rng ─► PipelineMapGenerator(createSettlementPasses())
   terrain ─► water ─► roads ─► landing sites ─► infestation plan ─► lots ─► buildings ─► interiors ─► props ─► ramps ─► hooks ─► infestation ─► connectivity
   ─► freezeDraft ─► validateTacticalMap (throws MapGenerationError) ─► TacticalMap
```

| Pass | What it does | Key decisions |
|---|---|---|
| terrain | fbm value noise, contrast ×2.2, quantised to levels; surface patches at 2× freq | raw fbm piles on one level |
| water | coastal band along one edge, level 0, sand beach | edge = rng pick |
| roads | builder per style (trail/streets/grid); largest network; 8-col chunks ±1; ramps at chunk steps; sidewalks; flat networks grade the whole plat; grid lays `roadWidth` lanes every `blockSize ± blockJitter` | cities: block 12 ± 2, two lanes, one level |
| infestation-plan | chooses separated colony centres and connecting feeding routes; quantized pressure field expands with level; reserves clearings before parcel allocation; safely excavates mature level cores; reserves level carapace building sites and circulation margins in selected large colonies | integer 0–10, default 0 is a no-op; independent RNG fork; landing clearance retained; shared metadata drives simulation and graphics |
| lots | shuffled (road column, side) anchors; rect beside corridor; gap 1, margin 1; count × `areaFactor` | inner-lane anchors reject themselves |
| buildings | weighted template per lot (house, shop, warehouse, tower, apartment); `ensureMultiStorey` | templates in `data/building-templates` |
| interiors | recursive bisection with a door per cut; room kinds `hall`/`room`/`storage` (`data/room-kind-ids`); stairs BFS-verified, holes interior-first; roof tiles; ladders ≤ 2 storeys and ≤ 2 levels of climb (#253) | `interiors` capability |
| props | vegetation by density with per-kind clusters; width-aware street props; yard clutter; room furnishing via `registries.roomFurnishing`; every interior placement BFS-verified | blocked: thresholds, connector ends |
| ramps | union-find over ground (`service/ground-components`); ramp per one-level step between components; spacing ramps | 2-level steps stay cliffs |
| hooks | `HookPlacer` registry; deploy (largest ground component, edge band); egg spawners (≥ 12 from deploy, ≥ 6 apart, half indoors, `HATCH_SPACE_MIN` 6 reachable tiles within `hatchRadius`, checked lazily in draw order); edge spawns (strict spacing first, relaxed only for zones that do not fit); extraction = deploy | placers share one `snapshotDraft` |
| connectivity | per hook × class: freeze, check, 0-1 BFS for cheapest repairs (prop / door / ramp), else relocate | I7 guarantee |
| infestation | invades ground, streets, slopes and ground-floor interiors; removes mature-colony vegetation; cuts connected wall/roof/upper-floor breaches; places footprint-aware colony organisms, carapace buildings, ruins and urban shelters | surviving interior routes verified before slab removal; preserve entrances, connectors, firing positions and landing sites; final connectivity repair still applies |

Entry: `service/generate-tactical-map.ts`. Adapter: `service/mission-map-recipe-adapter.ts` plus
`data/hook-kind-defaults.ts`. Metrics: `service/map-metrics.ts` (`computeMapMetrics`).
Hatch BFS: `service/hatch-space.ts`. Wide sweep: `MAPGEN_WIDE=1 pnpm exec vitest run generation-wide-sweep`.

Infestation is frozen into a mission's map parameters at offer time, in completed ten-point overworld bands. Both passes use their own RNG forks and level zero preserves baseline geometry exactly. `TacticalMap.infestation` records colony centres, optional carapace sites, corridors, a row-major pressure field and breach locations. The same field drives ground growth, asset substitutions and damage, keeping clean districts visually clean even on a heavily infested map. Slopes retain their shape and connectors while gaining the movement cost of resin. Ground-floor interiors retain their infantry-only pass mask. See [the infestation kit](kits/infestation.md) for art and review renders.

Elevation layers, half walls, the crash-site archetype and map scale are recorded in ADR 0008, ADR 0004 and ADR 0009. Tuning knobs and their measured effect are in `tactical-tuning.md`.
