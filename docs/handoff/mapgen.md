# Handoff: Map Generation Specialist

Last updated: 2026-09-04 06:20 UTC (session 3, update 2). Read `docs/process/roles/mapgen.md` and ADR 0004 first.

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
- **#353 and #355 merged.** `Tile.blocksLos` (#352) and `hatchTiles` / `snapshotMap` (#354) are on
  `main` and #326 / #329 consume them. No mapgen PR was left open by session 2.
- **Session 3 (2026-09-04) — the tactical audit.** With movement, sight, hit chance, the turn engine,
  spawning and bug AI landed, I measured the maps through the services that now consume them rather
  than through mapgen's own metrics. Findings and what came of them are in §3a. **Merged:** #437
  (#432 directional cover metrics), #443 (#433 edge spawn distance bands), #470 (#465 hook distance
  fitted to the board — a real `MapGenerationError` on small maps) and #456 (#448 `assessMap`, the
  play read-outs in the preview). **Waiting on other people:** #444 (a design call: mechs never gain
  elevation on city maps), #446 (melee bugs invert the cover rules — tactical's), #447 (the M3
  archetype sketch, with two questions to answer before anything is built) and the ruling asked for
  on #465 (should `resolveParams` reject an over-constrained recipe outright).
- **M2 issues that consume the map** (#316–#345 filed by the Producer): I left the exact APIs as
  comments on #323 (mission start), #325 (movement), #326 (sight and cover), #329 (spawning). #337
  reuses `graphics/view/tactical-map-view.ts`; #343 (headless sim) needs nothing new.
- Art follow-up #213 (`prop.table` placeholder) merged as #350.

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

## 3a. The tactical audit (2026-09-04)

Everything below was measured on `main` at `9b15c69` through the real tactical services
(`sight-service.hasLineOfSight`, `ReachabilityService`, `TileIndex`), medium maps, 6–8 seeds per
biome × settlement. Rebuild any of it as a throwaway `src/mapgen/zz-*.test.ts` (git-exclude it, move
it out of `src/` before `pnpm typecheck` / `lint`) — the recipe is `generateTacticalMap` with
`DEFAULT_MISSION_HOOKS`, then a BFS from `map.hooks.deployZones` per `PassMask`.

**Cover, the way tactical credits it.** `coverAgainst` only counts the one or two sides a shot
arrives from, so "20–23 % beside cover" is not what a squad feels. Share of open ground with cover
on ≥ 1 side: 15–20 % rural, 21–25 % town, 29–36 % city; on ≥ 2 sides: 3–6 % everywhere. Of the
tiles a squad can shoot an egg spawner from (infantry-reachable, range 8, LOS clear — 46–107 per
spawner, so position is not the constraint), **5–16 % have any cover against that spawner**. Deploy
tiles with cover on any side: 0–41 %, mean ≈ 24 %. Posted on #281 with the knobs; values unchanged,
the call is the Executive Director's. #432 / PR #437 puts the two directional shares in
`MapMetrics` and the preview so the call can be read live.

**Edge spawn walk-in (#433, PR #443).** Every zone seed came from the farthest third of the boundary
candidates, so waves spent the mission walking: nearest zone at the median 34 / 59 / 77 infantry
steps from deploy on small / medium / large. At two actions a turn (swarmer 14 tiles, lurker 12,
brute 6) the turn-3 wave reached the squad about turn 7 as swarmers and about turn 13 as brutes,
while deploy → nearest spawner is only 23–49 steps. The fix alternates distance bands (far third,
then middle third) and takes the medians to 28 / 45 / 61.

**Mech-passable tagging is healthy.** Mech-passable exterior ground unreachable from deploy: 0.0–0.3 %
of tiles, worst seed 0.9 %, largest pocket 13 tiles; infantry the same. Mech reach is 68–98 % of
infantry reach (the gap is interiors and roofs, which are infantry-only by I5). Nothing to fix.

**Small maps could crash, and now cannot from a mission (#465, PR #470).** A 16×16 map cannot hold
three egg spawners 12 tiles from a 16-tile deploy zone: on some seeds everything that far out is
rock, road or sidewalk, the placer finds no candidate and the map dies on I8. Six failures in 480 at
16×16. `missionToMapRecipe` now fits each kind's `minDistanceFromDeploy` to
`floor((width + depth) / 4) − 2` — manhattan spans both sides, so a long thin map keeps its room —
which leaves every preset untouched and takes 16×16 to 6, where 480 maps generate clean. Hand-built
recipes (`DEFAULT_MISSION_HOOKS`, the sweeps, the preview) still carry a flat 12 and can still fail
below about 24²; #465 asks the Tech Lead whether `resolveParams` should reject those outright.
Everything else about shape is fine: 256², 128², 16×256, 256×16, 17×43 and 33×97 all generate, 256²
in 1.8 s with 66k tiles.

**Heavy recipes are safe.** `INFESTATION_CLEARANCE` at difficulty 10 asks for 4 egg spawners and 3
edge spawns, which the wide sweep never exercises (it only uses `DEFAULT_MISSION_HOOKS`). Swept on
#443's branch: 216 maps over every biome × settlement × size, 0 failures, 0 relocations, 0 repairs.

**Buildings scale with the settlement.** Buildings per medium map and footprint share of the map
area: rural 2.0 / 1.5 %, town 8.4 / 6.3 %, city 18.5 / 9.6 %; mean floors 1.53 / 1.94 / 2.58. A
rural map is a field fight with almost no interior, which is the intended flavour.

**Deploy zones seat everyone.** Every deploy zone on every size is 16 tiles, all mech- and
infantry-passable, against I6's floor of 4 / 8. `startTacticalMission` places mechs first, so a
16-unit deployment fits; there is no roster size that can produce `no-deploy-room`.

**Objectives are all attackable.** Every egg spawner on every seed has an infantry firing position,
and one reachable by a mech too (indoor spawners are shot through windows — doors and solid walls
are opaque, windows are not). Two of three spawners sit indoors by design, so a mech can shoot them
but never reach them; that is the intended split and #426 does not change it.

**Cover cannot protect the player while every bug is melee (#446).** A prop tile is impassable, so no
bug can ever stand on the side a prop covers; the only side it can attack from is an uncovered one,
and `flanked = cover === NONE && anyCover` means having cover anywhere is what flags the squad as
flanked. Measured on a fixture: a squad beside one boulder is hit at 75 % by a swarmer, the same
squad in the open at 60 %. Cover still works for the bugs, who take −20 / −40 crossing open ground.
Filed for the tactical owner with four options; it inverts how #281 should be read, and there is a
second comment on #281 saying so.

**Elevation (#444).** Rural and town give a mech 0.09–0.37 of the reachable high ground; **cities
give it 0.00** on all four biomes and all 24 seeds, because city plats are graded flat with no ramps
and every vantage tile at a city spawner is a building tile. With #327's ±10 per level that is a
standing disadvantage with no counterplay. Filed as a design call with three options (a raised
outdoor feature per few blocks is the cheap one); not built, waiting on the Director. Also measured:
8/18 coastal-rural and 11–12/18 desert/temperate-rural spawners have no elevated firing position at
all, which reads as biome variety rather than a gap.

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
- **#231's open question is closed:** `unit-factory.bugUnit` gives every species `passClass:
  "infantry"`, brutes included, so edge spawns and egg spawners stay `PassMask.INFANTRY`. If a
  future species is ever built mech-sized, flip that kind's `requiredPass` in
  `data/hook-kind-defaults.ts` and the connectivity pass does the rest.

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

1. Nothing of mine is in review except this handoff. When a mapgen PR does conflict on a rebase, the
   sweep goldens are the file to expect it in: take theirs and re-pin from the vitest diff. And if
   the Tech Lead has already merged `main` into your branch (they push the merge to your branch as
   part of the gate), reset to theirs rather than force-pushing a rebase over it.
2. Get a decision on #444 (mechs never gain elevation in cities). Option 1 — a small mech-passable
   platform at level + 1 with a ramp, placed per few city blocks by the lot or prop pass — is the
   one I would build; it is a new generator feature, so it waits on the Director.
3. Run `MAPGEN_WIDE=1` before merging any generator change (60–85 s); it is the check that found
   #221. Re-run the §3a audit after any tuning change: the numbers there are the M2 baseline.
4. Answer map questions as the last M2 issues land — #426 (spawners as attack targets), #341 (the
   deploy → tactical → results flow), #343 / #344 (QA's headless sim and Playwright smoke). The map
   contract should not need to move again for M2; #231's question is closed (§4).
5. Tuning from §3 / §3a once the Executive Director calls #281 — read it together with #446, which
   says more cover currently means harder missions. The preview now shows all of it live: the two
   directional cover shares (#437) and the play read-outs — approach, bug walk-in, firing positions
   and how many are in cover or shooting down, mech reach, levels reached (#456, `assessMap`).
   Extend `tactical/service/map-assessment-service.ts` before writing a new scratch probe.
6. M3 archetypes: the sketch is #447, including the two questions to settle first (are hive caverns
   mech-passable, and how big is a hive). `createPipeline`'s per-archetype table in `service/settlement-pipeline.ts` takes a
   new pass list. Hive: cavern carve (cellular automaton on the dense heightmap, one level, `rock`
   walls as solid `WallSet`s), nest rooms as `Building`s with kind `nest` and a `nest` room kind in
   `data/room-furnishing`, `hive-core` hook placer; props/ramps/hooks/connectivity reuse as-is.
   Crash site: terrain + a crater pass (bowl, debris props, `wreck` building) before roads/lots.
   Platform: a decks pass (floor tiles on `void`, `PassMask.NONE` surface) instead of terrain/water.
   Two things the audit says these archetypes must get right from the start: hooks want distance
   bands, not a "far from deploy" rule (§3a), and a corridor map with cover on two sides of most
   tiles will play very differently from the settlement's 3–6 % — decide that deliberately.
7. Preview polish: a "regenerate with next seed" key; the metric delta column already ships (#276).
8. When an engineer takes #108 (promote `Registry` to `core/`), `mapgen/model/registry.ts` and
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
