# Handoff: Map Generation Specialist

Last updated: 2026-09-03 13:20 UTC (session 2, update 7). Read `docs/process/roles/mapgen.md` and ADR 0004 first.

## 1. Where things stand

- **M1.5 is on `main` and validated.** Every pass, `generateTacticalMap`, the sweep with goldens, the
  preview harness (built since #209) and the mission → recipe adapter merged 2026-09-03. Validated
  against `main`: tsc, unit suite, build, the preview e2e (QA promoted a 72-combination preview
  matrix in #225), and a 1200-map wide sweep (0 relocations, I1–I8 clean). Its one crash (#221)
  is fixed (#223).
- **Merged quality PRs today:** #206 city plats graded flat, #211 two-lane city streets with
  `blockSize` 12, #212 room furnishing per kind, #215 visible trails, #224 vegetation clusters,
  #235 hatch space around egg spawners (M2), #239 map metrics in the preview, #242 apartment
  template, #245 wide sweep behind `MAPGEN_WIDE=1`, #249 snowy fences, #253 ladder climb cap,
  #223 edge-trail crash fix. Epic #32 has no open children (noted on the epic for the Producer).
- **Also merged since update 6:** #260 edge-spawn spacing relaxes on the smallest maps, #269 tuning
  pass 1 (desert cover, ramp spacing), #272 city block jitter ± 2, #276 preview seed stepping and
  metric deltas. `main` re-validated at bb98b7e: unit suite and the 1200-map wide sweep.
- **Design decision #281** (cover density): the Director chose *keep as is* (~20 % towns, ~23 %
  cities) and to halve `streetPropDensity` only if two-lane cities read busy in play; the issue stays
  open under M2 for the Executive Director's call from a playable mission.
- **Open PRs for M2** (independent, each against `main`, green locally and on CI):
  1. #353 `Tile.blocksLos` denormalised from the prop definition, I2 checks it, ADR §4.2 updated (#352):
     lets #326's sight service stay pure over `TacticalMap` + `TileIndex`.
  2. #355 `hatchTiles` + `snapshotMap` in `service/hatch-space.ts` (#354): the tile set #329's spawn
     service hatches into; `hatchSpace` is its length.
- **M2 issues that consume the map** (#316–#345 filed by the Producer): I left the exact APIs as
  comments on #323 (mission start), #325 (movement), #326 (sight and cover), #329 (spawning). #337
  reuses `graphics/view/tactical-map-view.ts`; #343 (headless sim) needs nothing new.
- Art follow-up #213 (`prop.table` placeholder) is the Art Director's.

## 2. Pipeline as built

```
 MapRecipe ─► hashSeed ─► Rng ─► PipelineMapGenerator(createSettlementPasses())
   terrain ─► water ─► roads ─► lots ─► buildings ─► interiors ─► props ─► ramps ─► hooks ─► connectivity
   ─► freezeDraft ─► validateTacticalMap (throws MapGenerationError) ─► TacticalMap
```

| Pass | What it does | Key decisions |
|---|---|---|
| terrain | fbm value noise, contrast ×2.2, quantised to levels; surface patches at 2× freq | raw fbm piles on one level |
| water | coastal band along one edge, level 0, sand beach | edge = rng pick |
| roads | builder per style (trail/streets/grid); largest network; 8-col chunks ±1; ramps at chunk steps; sidewalks; flat networks grade the whole plat; grid lays `roadWidth` lanes every `blockSize ± blockJitter` | cities: block 12 ± 2, two lanes, one level |
| lots | shuffled (road column, side) anchors; rect beside corridor; gap 1, margin 1; count × `areaFactor` | inner-lane anchors reject themselves |
| buildings | weighted template per lot (house, shop, warehouse, tower, apartment); `ensureMultiStorey` | templates in `data/building-templates` |
| interiors | recursive bisection with a door per cut; room kinds `hall`/`room`/`storage` (`data/room-kind-ids`); stairs BFS-verified, holes interior-first; roof tiles; ladders ≤ 2 storeys and ≤ 2 levels of climb (#253) | `interiors` capability |
| props | vegetation by density with per-kind clusters; width-aware street props; yard clutter; room furnishing via `registries.roomFurnishing`; every interior placement BFS-verified | blocked: thresholds, connector ends |
| ramps | union-find over ground (`service/ground-components`); ramp per one-level step between components; spacing ramps | 2-level steps stay cliffs |
| hooks | `HookPlacer` registry; deploy (largest ground component, edge band); egg spawners (≥ 12 from deploy, ≥ 6 apart, half indoors, `HATCH_SPACE_MIN` 6 reachable tiles within `hatchRadius`, checked lazily in draw order); edge spawns (strict spacing first, relaxed only for zones that do not fit); extraction = deploy | placers share one `snapshotDraft` |
| connectivity | per hook × class: freeze, check, 0-1 BFS for cheapest repairs (prop / door / ramp), else relocate | I7 guarantee |

Entry: `service/generate-tactical-map.ts`. Adapter: `service/mission-map-recipe-adapter.ts` +
`data/hook-kind-defaults.ts`. Metrics: `service/map-metrics.ts` (`computeMapMetrics`, PR #239).
Hatch BFS: `service/hatch-space.ts`. Wide sweep: `MAPGEN_WIDE=1 pnpm exec vitest run generation-wide-sweep`
(PR #245). Scratch measurements: a throwaway `src/mapgen/zz-debug.test.ts` (git-excluded; move it
out before `pnpm typecheck`/`lint`).

## 3. Measurements (medium maps, 8 seeds per cell, `main` before #269; desert and ramps moved as noted below)

Share of open ground beside a cover prop / beside a wall; high and low cover tiles per 100 ground
tiles; interior props per building; ramps per map.

| | temperate | snowy | desert | coastal |
|---|---|---|---|---|
| rural | 15 % / 1 %, 5.6 H 1.0 L, 2.3, 41 ramps | 13 % / 1 %, 5.0 H 0.9 L, 2.6, 47 | 16 % / 1 %, 2.2 H 3.1 L, 2.5, 36 | 16 % / 2 %, 5.0 H 1.0 L, 2.6, 19 |
| town | 18 % / 6 %, 5.5 H 2.2 L, 3.1, 54 | 15 % / 5 %, 5.0 H 2.0 L, 3.2, 58 | 16 % / 6 %, 1.6 H 3.6 L, 2.8, 42 | 16 % / 8 %, 3.8 H 2.2 L, 2.9, 20 |
| city | 23 % / 10 %, 3.5 H 4.0 L, 3.2, 0 | 22 % / 11 %, 3.5 H 3.7 L, 3.3, 0 | 23 % / 11 %, 1.7 H 5.1 L, 3.4, 0 | 22 % / 15 %, 2.6 H 4.3 L, 3.1, 0 |

Hatch space minimum is 7–13 tiles of 25 everywhere (floor is 6). City maps with a 3+-floor
building: 71/72 (was 61/72 before apartments); towns 67/72.

**Applied in #269 (tuning pass 1), measured the same way:** desert boulders 2.5 + palms 1 take
desert high cover to 3.5 (rural) / 3.0 (town) per 100 and cover adjacency to 18.8 % / 19.8 %;
`rampSpacing` rural 8 / town 7 takes ramps per medium map from 37 / 43 to 28 / 33 with connectivity
repairs and relocations still zero.

**Decided on #281:** cover density stays where it is until a playable mission says otherwise; the
knobs if it changes are `yardPropDensity` (town 10 → 15 for ~30 %), a `cabinet` interior kind (high,
blocks LOS; needs a placeholder like #213), and `streetPropDensity` (halve if two-lane cities read
busy). Explicit sizes: the resolver accepts 16–256 and every accepted size generates (#260); 128²
takes ~260 ms. Heavy recipes (8 egg spawners, 6 edge spawns) generate on small and medium presets
with zero relocations.

## 4. What M2 (tactical) consumes

- `generateTacticalMap(missionToMapRecipe(mission, missionType).value)` → `TacticalMap` (plain JSON).
- `service/tile-index.ts` (`TileIndex.getAt/column/neighbour`) and `service/reachability-service.ts`
  (`canStep`, `neighbours`, `reachableFrom`, `isConnected`) implement ADR 0004 §5 exactly; tactical's
  movement rules must not make a move legal that `canStep` forbids.
- Hooks: `map.hooks.deployZones[].tiles`, `objectives[]` (egg spawners, `meta.hatchRadius` 3, ≥ 6
  reachable tiles around each), `edgeSpawns[]` (boundary tiles, infantry-reachable), `extraction`.
- `snapshotMap(map)` then `hatchTiles(snapshot, origin, radius, PassMask.INFANTRY)` from
  `service/hatch-space.ts` (#355) for the exact tile set a spawner hatches into, origin first.
- `Tile.blocksLos` (#353) and `Tile.coverProvided` for sight and cover; walls on both sides of an edge
  (`tile.walls`, I3); `y` is the level for elevation bonuses.
- Open question filed on #231: if brutes are mech-sized, set edge spawns' `requiredPass` to
  `PassMask.ALL` in `data/hook-kind-defaults.ts`.

## 5. Decisions made and why

- Freeze lives in the entry, not a "finalize" pass; ids in `content/model`, definitions in `mapgen/data`
  keyed `Record<Id, Def>`; draft predicates in `service/draft-queries.ts`; repairs are a 0-1 BFS.
- Plat grading follows the builder's `levelling: "flat"`; `roadWidth` sits on the settlement and
  only `grid` honours it; room furnishing and hook placers are registries so hives can extend them.
- Clusters preserve expected density (seed rate = density / mean cluster size).
- Hatch space is checked lazily in draw order (Tech Lead review on #235): candidate-wide BFS pushed
  the CI sweep past 30 s.
- Slow generation tests carry explicit vitest timeouts; the sweep must stay under #30's 20 s budget on
  CI, which is about half the speed of these instances.

## 6. What I would do next, in order

1. Keep the review loop for #353 and #355 (independent; rebase, gate, `--force-with-lease`).
   Then answer questions on #323/#325/#326/#329 as engineers pick them up; the map contract should
   not need to move again for M2 unless brutes turn out mech-sized (flip edge spawns to
   `PassMask.ALL` in `data/hook-kind-defaults.ts`).
2. Run `MAPGEN_WIDE=1` before merging any generator change (85 s); it is the check that found #221.
3. Tuning from §3 once the Director picks targets; the preview shows the metrics live.
4. M3 archetypes: `createPipeline`'s per-archetype table in `service/settlement-pipeline.ts` takes a
   new pass list. Hive: cavern carve (cellular automaton on the dense heightmap, one level, `rock`
   walls as solid `WallSet`s), nest rooms as `Building`s with kind `nest` and a `nest` room kind in
   `data/room-furnishing`, `hive-core` hook placer; props/ramps/hooks/connectivity reuse as-is.
   Crash site: terrain + a crater pass (bowl, debris props, `wreck` building) before roads/lots.
   Platform: a decks pass (floor tiles on `void`, `PassMask.NONE` surface) instead of terrain/water.
5. Preview polish: show `MapMetrics` deltas between two seeds; a "regenerate with next seed" key.
6. When an engineer takes #108 (promote `Registry` to `core/`), `mapgen/model/registry.ts` and
   `service/definition-registry.ts` are the files to retire; nothing in mapgen depends on the class.

## 7. Gotchas

- GitHub API budget is shared: poll ≤ every 5 min, REST only; create PRs with
  `gh api -X POST repos/.../pulls -f title= -f head= -f base=main -F body=@file` (write the body file
  before any gate that can abort the script). Pushes cost no quota.
- Verify with real exit codes; scratch files must be out of `src/` before `pnpm typecheck`/`lint`.
- Stacked goldens conflict on every rebase: `git checkout --theirs` the sweep file, run a re-pin
  helper that parses the received checksums out of the vitest diff (strip ANSI, stdout+stderr), add,
  `GIT_EDITOR=true git rebase --continue`. Never run other git commands while a rebase is conflicted:
  a stray commit derails `--update-refs`. Check every branch's `rev-list --count origin/main..` before pushing.
- `pkill -f <pattern>` kills your own shell when the pattern is in your command line (exit 144); kill
  the dev server by the PID on :5173 from `ss -ltnp`.
- A worktree with symlinked `node_modules` cannot run `pnpm` scripts; use `node_modules/.bin/*`; run
  Playwright from the real checkout.
- The Tech Lead merges minutes after a rebase; expect "stale info" on a push to mean "already merged".
- Every GitHub comment starts with `**MapGen** · TUT agent`.
