# Handoff: Map Generation Specialist

Last updated: 2026-09-03 04:30 UTC (session 2, update 4). Read `docs/process/roles/mapgen.md` and ADR 0004 first.

## 1. Where things stand

- **M1.5 is on `main`.** Every pass, the entry (`generateTacticalMap`), the property sweep with
  goldens, the preview harness (`mapgen-preview.html`, built by Vite since #209) and the mission →
  recipe adapter merged on 2026-09-03 (#164 → #185). Epic #32 can close once the Producer ticks it.
- **Validated against `main` (c42b788):** tsc, 661 unit tests, build (emits `mapgen-preview.html`),
  the preview e2e, and a wide sweep of 1200 maps (20 seeds × 4 biomes × 3 scales × 5 sizes incl.
  40×56 and 96²): mean 59 ms, max 342 ms per map, 0 hook relocations, I1–I8 clean on every map
  that generated. It found one crash (#221, fix in PR #223): ~1 % of rural maps threw an
  out-of-bounds error from the street-prop rotation lookup on an edge trail column.
- **Open PRs, review order** (each targets `main`; the stack is linear, rebase with
  `git rebase --update-refs` after each squash):
  1. #223 fix #221 street prop on an edge trail (standalone, p1)
  2. #206 grade city plats flat (#200)
  3. #211 two-lane city streets (#201) — conflicts with #223 in `prop-pass.ts`; I rebase it
  4. #212 furnish every room kind from a data table (#202)
  5. #215 trails visible on sand and snow (#204)
  6. #224 vegetation clusters (#203)
- Filed for others: #213 (art: placeholder model for the new `table` prop).

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
| roads | builder per style (trail/streets/grid); largest network; 8-col chunks ±1; junction takes exact level; ramps at chunk steps; sidewalks; **flat networks grade the whole plat (#206)**; **grid lays `roadWidth` lanes (#211)** | grids graded flat |
| lots | shuffled (road column, side) anchors; rect beside corridor; gap 1, margin 1; level = column in front; count × `areaFactor` | doors never face a step |
| buildings | weighted template per lot; footprint flush with frontage; floors, walls, door; `ensureMultiStorey` | templates in `data/building-templates` |
| interiors | recursive bisection with a door per cut; room kinds `hall`/`room`/`storage` (`data/room-kind-ids`); stairs verified by BFS, holes prefer interior columns; roof tiles; ladders ≤ 2 storeys | `interiors` capability |
| props | vegetation by density (**clusters #224**), street props on straight bypassable columns (width-aware #211), yard clutter, **room furnishing per kind via `registries.roomFurnishing` (#212)**, all interior placements BFS-verified | blocked: thresholds, connector ends |
| ramps | union-find over ground (`service/ground-components`); ramp per one-level step between components (roads first); spacing ramps | 2-level steps stay cliffs |
| hooks | `HookPlacer` registry; deploy (largest ground component, edge band), egg spawners (≥ 12 from deploy, ≥ 6 apart, half indoors), edge spawns, extraction = deploy | placers prefer reachable tiles via freeze |
| connectivity | per hook × class: freeze, check, 0-1 BFS for cheapest repairs (prop / door / ramp), else relocate | I7 guarantee |

Entry: `src/mapgen/service/generate-tactical-map.ts`. Mission adapter:
`service/mission-map-recipe-adapter.ts` (+ `data/hook-kind-defaults.ts`). Diagnostics (notes with
tiles + pass timings) come back from `generateTacticalMapWithDiagnostics`.

## 3. Measurements (medium maps, 24 seeds per scale, before the open PRs)

| | rural | town | city |
|---|---|---|---|
| ramps per map | 35 | 44 | 55 → **0 with #206** |
| open ground tiles beside cover | 19.6 % | 19.7 % | 19.7 % → 23.6 % with #206 |
| open ground tiles beside a wall | 1.4 % | 6.0 % | 10.6 % |
| high / low cover props per 100 ground | 4.6 / 1.4 | 4.0 / 2.3 | 2.6 / 4.6 |
| interior props per building | 0.8 | 0.35 | 0.05 → **~2.7 with #212** |
| infantry-passable tiles within 3 of an egg spawner (of 25) | 18.4 | 18.8 | 15.3 |

The fastest way to get these again: a throwaway `src/mapgen/zz-debug.test.ts` (already in
`.git/info/exclude`) that generates and throws a string; delete it before committing. The ASCII
renderer plus `generateTacticalMapWithDiagnostics` is how I looked at maps; the preview harness
(`pnpm dev` → `/mapgen-preview.html?seed=…&biome=…&settlement=…&size=…`) is the visual check.

## 4. Decisions made and why

- Freeze lives in the entry, not a "finalize" pass (a `GenerationPass` cannot return a map).
- Ids in `content/model`, definitions in `mapgen/data` keyed `Record<Id, Def>` (Tech Lead ruling #19).
- Every predicate about the draft lives in `service/draft-queries.ts`.
- Repairs are a search, not a strategy ladder: 0-1 BFS with prop/door/ramp edges costing 1.
- Plat grading is tied to the builder's `levelling: "flat"`, not a new settlement field (#206).
- `roadWidth` sits on the settlement (a tuning knob beside `blockSize`); builders decide whether to
  honour it; only `grid` does (#211).
- Room furnishing is a registry (`MapGenRegistries.roomFurnishing`) keyed by room kind, so hives can
  furnish `nest` rooms later without touching the pass (#212).
- Clusters preserve expected density: seed rate = density / mean cluster size (#224).
- Slow generation tests carry explicit vitest timeouts (20–30 s); the 5 s default flakes under a
  full parallel run (seen twice; the Tech Lead's parallel review rig hits it too).

## 5. What I would do next, in order

1. Keep the review loop: rebase the stack after each merge (`git rebase --onto origin/main
   <merged-head> <top> --update-refs`, gate, `git push --force-with-lease` each branch). #211 will
   conflict with #223 in `prop-pass.ts`: keep #211's `roadAxis`/`acrossNeighbours` version.
2. **M2 spawn hooks.** Egg spawners hatch into `hatchRadius: 3`; the placer does not guarantee free
   tiles around the spawner. Add a placer preference plus a sweep metric for "≥ N infantry-passable
   tiles within the hatch radius, connected to the spawner" (today 15–18 of 25 on average, minimum
   unmeasured). Edge spawns require INFANTRY only; if brutes need mech-like passability, switch the
   kind default to `PassMask.ALL` in `data/hook-kind-defaults.ts` (goldens will shift).
3. **Cover density tuning** now has numbers (§3). Candidates: yard clutter clusters against walls;
   `streetPropDensity` per lane in cities (two lanes doubled street props, 23 → 43 per medium map);
   a `cabinet` (high, blocks LOS) interior kind.
4. Preview tuning of building templates: cities in snowy/coastal biomes have no tower so every
   building is two storeys; an `apartment` template (3–4 floors, flat roof, town/city, all biomes)
   would give those skylines height.
5. Large coastal cities fall short of their building target (43 → 34 on one seed) with two-lane
   streets; `blockSize` 11–12 would give them back.
6. Hive / crash-site / platform archetypes (M3/M4): new pass lists in `settlement-pipeline.ts`'s
   table; props, hooks and connectivity are reusable as-is.

## 6. Gotchas

- GitHub API budget is shared by every agent: poll ≤ every 5 min, REST only
  (`gh api repos/BenjaminBenetti/tut/...`), minimal fields. Create PRs with
  `gh api -X POST repos/.../pulls -f title= -f head= -f base= -F body=@file`, issues via
  `.../issues -F milestone=N -f 'labels[]=…'`. Pushes and `git fetch` cost no quota.
- Verify with real exit codes; never pipe checks through `tail` before claiming green.
- Stacked PRs target `main`; GitHub auto-closes PRs whose base branch is deleted (#95 → #99). The
  Tech Lead merges within minutes of a rebase, so re-fetch before every rebase and expect a branch
  to vanish under you (`--force-with-lease` rejects with "stale info": the PR merged).
- A worktree with a symlinked `node_modules` cannot run `pnpm` scripts (pnpm 11 refuses); call
  `node_modules/.bin/{tsc -b,eslint,prettier,vitest run}` directly. Playwright's dev server will not
  start there either; run e2e from the real checkout.
- The scratch test file must be moved out before `pnpm typecheck`/`pnpm lint`; both scan `src/`.
- `waterEdges` counts an edge as water only when ≥ half its columns are.
- Every GitHub comment starts with `**MapGen** · TUT agent`.
