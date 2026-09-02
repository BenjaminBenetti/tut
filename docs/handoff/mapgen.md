# Handoff: Map Generation Specialist

Last updated: 2026-09-02 (session 1, update 2). Read `docs/process/roles/mapgen.md` and ADR 0004 first.

## 1. Where things stand

- **ADR 0004** (`docs/adr/0004-tactical-map-contract.md`) is Accepted and merged (#14). It is the
  contract: data model, traversal rule (§5), invariants (§6), pipeline design (§7).
- **Epic #32** tracks M1.5. Issues #17–#31, #33, #97 (#29 was split). Work them in number order.
- **Merged:** #17 model + `TileIndex` (#88), #19 biome/settlement/size data + resolver (#99),
  #18 validator + reachability + ASCII (#113), #20 pipeline runner + `MapDraft` (#120),
  #21 terrain + water passes (#129).
- **In review:** #22 road pass (PR #138), #23 lot pass (PR #139, stacked on #138).
- **Next:** #24 building shells, #25 rooms/stairs/roofs, #26 props, #27 ramps, #28 hooks,
  #29 connectivity repair, #97 finalize + entry, #30 property sweep, #31 preview.

## 2. Pipeline as built

```
 MapRecipe ─► resolveMapGenParams ─► MapDraft(width, depth, ids, grass)
   terrain ─► water ─► roads ─► lots ─► [buildings ─► props ─► ramps ─► hooks ─► connectivity] ─► [finalize]
   each pass: ctx.rng = root.fork(pass.id); runner checks requires ⊆ provides and unique ids
```

- `TerrainPass`: fbm value noise, contrast-stretched ×2.2 about 0.5 (raw fbm piles everything on
  one level), quantised to `[0, amplitudeLevels]`; surface patches from a 2× frequency field
  thresholded against cumulative surface weights.
- `WaterPass`: coastal only; band along one edge, depth wobbles with 1D noise, level 0 water plus a
  2-column sand beach.
- `RoadPass`: builder per style (`trail`, `streets`, `grid`) behind `RoadBuilder`; keeps largest
  connected network; levels lines in 8-column chunks within ±1 (grids graded flat to the median);
  a line starting beside a road takes that road's level exactly; adds `ramp` connectors at chunk
  steps; sidewalks raised to road level in town/city.
- `LotPass`: shuffled (road column, side) anchors; lot rects sized from settlement, one setback past
  sidewalks; rejects road/sidewalk/water/other lots/1-column gap/map margin; flattens lot to anchor
  level; records `frontage`.
- Ground stays dense on the draft (`Int8Array` levels, surface array, road and covered masks);
  buildings add sparse `DraftTile`s; freeze (#97) materialises ground tiles.

## 3. Decisions made and why

- Sparse tiles, uniform levels, explicit connectors, per-tile pass bitmask: ADR 0004 §2/§10.
- Reuse core: `TileCoord = GridPos`; `Direction`, `Rect`, grid-math, `IdGenerator`, `Rng` from core.
- Ids in `content/model` (`BiomeId`, `SettlementScale` closed unions), definitions in `mapgen/data`
  keyed `Readonly<Record<Id, Def>>` so a missing definition fails to compile (Tech Lead ruling, #19).
- `PropDefinition.placements` added beyond the ADR sketch; `PropId` in the ADR means `PropKindId` in
  code. ADR wording fix still owed in a docs PR.
- `FixtureMapBuilder` (`service/`) hand-builds valid maps for tests; documented as test-only.
- Road levelling mode lives on the builder (`levelling: follow | flat`), not on settlement data.
- Preview harness convention (Tech Lead): `mapgen-preview.html` + `src/mapgen-preview.ts`, view in
  `graphics/view/`, controls in `ui/screen/`; Vite multi-page input is #33 (Tech Lead).

## 4. What I would do next, in order

1. Land #138 and #139 (rebase #139 onto main after #138 squashes: `git rebase --onto origin/main <old-#22-head>`).
2. #24: `data/building-templates.ts` (house, shop, warehouse, tower: footprint and floor ranges,
   roof kind, window density, allowed scales) + `building-pass` part 1: pick template per lot by
   biome weight, emit floor tiles (`buildingId`, `floorIndex`, surface `floor`), exterior walls via
   `draft.setWall` (mirrors onto ground), door + `Entrance` on the lot's frontage side, mark footprint
   `covered`. Keep under ~500 lines; rooms/stairs/roofs are #25.
3. #25, #26, #27, #28 as in the epic. #28 must use `MIN_DEPLOY_*` from `map-validator`.
4. #29 repair, #97 freeze + `generateTacticalMap` (build root RNG from `hashSeed(recipe.seed)`),
   #30 sweep + golden seeds, #31 preview.

## 5. Gotchas

- Verify with real exit codes (`pnpm typecheck; echo $?`), never through `| tail`; a masked red
  typecheck went out once on #95.
- `noUncheckedIndexedAccess` is on; lint requires JSDoc on interface method signatures and explicit
  return types; `import type`; Prettier runs in `pnpm lint` (run `pnpm format` first).
- Stacked PRs: target `main`, not the parent branch; GitHub auto-closes PRs whose base branch is
  deleted and they cannot be reopened (#95 → #99).
- `waterEdges` counts an edge as water only when ≥ half its columns are: a band along one edge wets
  the corners of its neighbours.
- Tune with measurement: a throwaway `zz-debug.test.ts` that throws a histogram string is the
  fastest way to see distributions (delete it before committing).
- Every GitHub comment starts with `**MapGen** · TUT agent`.
