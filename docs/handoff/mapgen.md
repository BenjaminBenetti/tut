# Handoff: Map Generation Specialist

Last updated: 2026-09-02 (session 1, update 3). Read `docs/process/roles/mapgen.md` and ADR 0004 first.

## 1. Where things stand

- **ADR 0004** is Accepted (#14). Epic **#32** tracks M1.5; issues #17–#31, #33, #97.
- **Merged:** #17 model (#88), #19 data (#99), #18 validator/reachability/ASCII (#113), #20 runner
  (#120), #21 terrain+water (#129), #22 roads (#138), #23 lots (#139), #24 building shells (#150),
  #25 interiors + draft freezer (#154).
- **In review, stacked in this order (each targets `main`; rebase + force-push after each merge):**
  #26 props (PR #164) → #27 ramps (#170) → #28 hook placers (#173) → #29 connectivity (#174) →
  #97 pipeline factory + `generateTacticalMap` (#176) → #30 property sweep + goldens (#177).
- **Remaining:** #31 preview harness (needs #33 Vite multi-page from the Tech Lead), #85 mission →
  MapRecipe adapter (Producer-filed, blocked by #97 and #51).
- **The full pipeline works end to end on the stacked branch:** `generateTacticalMap(recipe)` returns
  maps that satisfy I1–I8 for every biome × settlement × size across 216 seeds; 524 tests in ~8 s.

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
| roads | builder per style (trail/streets/grid); largest network; 8-col chunks ±1; junction takes exact level; ramps at chunk steps; sidewalks | grids graded flat |
| lots | shuffled (road column, side) anchors; rect beside corridor; gap 1, margin 1; level = column in front | doors never face a step |
| buildings | weighted template per lot; footprint flush with frontage from lot's first column; floors, walls (window density), door facing corridor; `ensureMultiStorey` | templates in `data/building-templates` |
| interiors | recursive room bisection with a door per cut; stairs verified by BFS; roof tiles; ladders ≤ 2 storeys | `interiors` capability |
| props | vegetation by density, street props on straight bypassable columns, yard clutter (`yardPropDensity`), storage-room crates verified by BFS | blocked: thresholds, connector ends |
| ramps | union-find over ground (`service/ground-components`); ramp per one-level step between components (roads first); spacing ramps | 2-level steps stay cliffs |
| hooks | `HookPlacer` registry; deploy (largest ground component, edge band), egg spawners (≥ 12 from deploy, ≥ 6 apart, half indoors), edge spawns, extraction = deploy | placers prefer reachable tiles via freeze |
| connectivity | per hook × class: freeze, check, 0-1 BFS for cheapest repairs (prop / door / ramp), else relocate | I7 guarantee |

Entry: `src/mapgen/service/generate-tactical-map.ts`. Baseline hooks: `data/hook-requirements.ts`.
Diagnostics (notes with tiles + pass timings) come back from `generateTacticalMapWithDiagnostics`.

## 3. Decisions made and why

- Freeze lives in the entry, not a "finalize" pass: a `GenerationPass` cannot return a map (noted on #176).
- Ids in `content/model`, definitions in `mapgen/data` keyed `Record<Id, Def>` (Tech Lead ruling #19).
- `TileCoord = GridPos`; all grid math from `core/`.
- Every predicate about the draft ("passable ground", "open ground") lives in `service/draft-queries.ts`.
- Room kinds: warehouses all `storage`; shops' non-hall ground rooms `storage`; entrance room `hall`.
- Repairs are a search, not a strategy ladder: 0-1 BFS with prop/door/ramp edges costing 1.
- ADR wording still owed: `PropId` → `PropKindId`; "adding a biome touches only data" → plus the union.

## 4. What I would do next, in order

1. As each stacked PR merges: `git rebase --onto origin/main <old-parent-head> <branch>`, run checks,
   `git push --force-with-lease`. Never rebase a PR the Tech Lead is mid-review on without saying so.
2. #31 preview harness once #33 lands: `mapgen-preview.html` + `src/mapgen-preview.ts`; view in
   `src/graphics/view/tactical-map-view.ts` (boxes per surface, wall quads, prop boxes by cover,
   wedges for ramps/stairs/ladders, hook markers, level slider); controls in
   `src/ui/screen/mapgen-preview-screen.ts`; palette in `src/graphics/data/mapgen-preview-palette.ts`.
   Use the isometric camera rig from #118. Print `renderAscii` + diagnostics in a side panel.
3. #85 adapter when #97 merges: `service/mission-map-recipe-adapter.ts`.
4. Docs PR: ADR wording fixes above; `architecture.md` §5 already points at the ADR.
5. Quality: tune building templates/prop densities in the preview; stairwell facade gap (leave a window);
   clusters of props; road width 2 for cities.

## 5. Gotchas

- GitHub API budget is shared by every agent: poll ≤ every 5 min, REST only
  (`gh api repos/BenjaminBenetti/tut/...`), minimal fields. Create PRs with
  `gh api repos/.../pulls -f title= -f head= -f base= -f body=`, label with `.../issues/N/labels`.
- Verify with real exit codes; never pipe checks through `tail` before claiming green.
- Stacked PRs target `main`; GitHub auto-closes PRs whose base branch is deleted (#95 → #99).
- Sweep found bugs the per-pass tests missed twice (single-storey towns, mesa deploy zones); keep it.
- A throwaway `zz-debug.test.ts` that throws a histogram string is the fastest way to measure
  distributions; delete it before committing.
- Every GitHub comment starts with `**MapGen** · TUT agent`.
