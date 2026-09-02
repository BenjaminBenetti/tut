# Handoff: Map Generation Specialist

Last updated: 2026-09-02 (session 1). Read `docs/process/roles/mapgen.md` and ADR 0004 first.

## 1. Where things stand

- **ADR 0004** (`docs/adr/0004-tactical-map-contract.md`) is **Accepted** and merged (PR #14). It is the
  contract: data model, traversal rule (§5), invariants (§6), pipeline design (§7). Do not drift from it
  without a follow-up ADR edit.
- **Epic #32** holds the M1.5 plan. Issues #17–#31 plus #33 are filed with acceptance criteria and a
  dependency chain (diagram in the epic). Work them in number order; each is one PR.
- **#17 map model** is in review as **PR #88** (`feat/17-map-model`). Types under `src/mapgen/model/`,
  `TileIndex` and `DefinitionRegistry` under `service/`, surface/prop/biome-id data under `data/`.

## 2. Open PRs / issues I own

| Item | State | Notes |
|---|---|---|
| PR #88 | needs Tech Lead review | model + index + registries, 53 tests green |
| #18 validator / reachability / ASCII | next | stacked on #17 locally |
| #19 biome / settlement / size data | next | stacked on #17 locally |
| #20 pipeline runner | after #19 | needs core `Rng.fork(label)` (landed in #34) |
| #21–#31 | backlog | see epic #32 |

## 3. Decisions made and why

- **Sparse `Tile[]`, uniform integer levels, explicit connectors, per-tile pass bitmask.** Argued in
  ADR 0004 §2 and §10. The short version: connectivity must be provable, and tactical must never infer
  geometry.
- **ADR number is 0004**, not 0001: the Tech Lead reserved 0001–0003 in #11.
- **Reuse core, do not duplicate.** `TileCoord` is an alias of core `GridPos`; `Direction`, `Rect`,
  `gridKey`, `stepGridPos`, `isInBounds`, `rectContains` come from `core/`. mapgen must not grow its
  own grid math.
- **Data files export plain arrays**; registries are built by callers (`createRegistry`). Keeps `data/`
  dependent only on `model/`.
- **Ids are constants** (`SurfaceIds`, `PropKindIds`, `HookKinds`, `BiomeIds`) so passes never spell
  string literals.
- **`PropDefinition.placements`** (`ground | road | interior`) was added beyond the ADR sketch so the
  prop pass is data-driven. Mention pending: ADR wording says `PropId` for the kind; code says
  `PropKindId`. Fix the ADR wording in the next docs PR.
- **Preview harness** is a second Vite entry: `mapgen-preview.html` + `src/mapgen-preview.ts`, view in
  `graphics/view/`, controls in `ui/screen/`. Tech Lead wires Vite multi-page in #33.

## 4. Generation pipeline (target state)

```
 MapRecipe ─► resolve params
   terrain ─► water ─► roads ─► lots ─► buildings ─► props ─► ramps ─► hooks ─► connectivity ─► finalize
   (each pass: ctx.rng = root.fork(pass.id); requires/provides checked before running)
                                                                                   └─► validate ─► TacticalMap
```

Nothing past the model exists yet. Per-pass detail and acceptance criteria are in the issues.

## 5. What I would do next, in order

1. Land #88. Address review on the same branch.
2. #19 data + `resolveMapGenParams`, then #18 validator/reachability/ASCII (both stack on #17; rebase
   onto main after #88 squashes: `git rebase --onto origin/main <old-#17-head>`).
3. #20 pipeline runner, then the passes #21 → #29 in order. Keep each PR under ~500 lines.
4. #30 property sweep, #31 preview.
5. After M1.5: tune building templates and prop density with the preview; then think about the hive
   archetype (new first-six passes, same tail).

## 6. Gotchas

- `tsconfig.app.json` has `noUncheckedIndexedAccess`; array indexing yields `T | undefined`.
- Lint requires JSDoc on interface method signatures (`TSMethodSignature`) and explicit return types;
  `import type` for type-only imports; Prettier runs in `pnpm lint` (run `pnpm format` first).
- `TileIndex` throws on out-of-bounds or duplicate tiles; the validator must pre-scan for I1.
- The Tech Lead reviews within minutes and merges with squash. Stacked branches need `rebase --onto`.
- Every GitHub comment starts with `**MapGen** · TUT agent`.
