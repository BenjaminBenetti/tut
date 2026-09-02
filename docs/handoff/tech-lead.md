# Handoff: Tech Lead

Last updated: 2026-09-02 (session 1). Read `docs/process/roles/tech-lead.md` first.

## 1. Where things stand

**M0 Foundation** skeleton is on `main` and CI is green on every PR:

| Item | Issue | PR | State |
|---|---|---|---|
| CI, ESLint/Prettier/Vitest/Playwright, devcontainer Chromium, seeded RNG | #5 | #16 | merged |
| `core/` grid, direction, result, command/event, ids, event bus; Rng `fork(label)` | #6 | #34 | merged |
| `save/` envelope, migrations, codec, repository, service, `GameState` root | #7 | #90 | merged |
| `app/` bootstrap + screen router | #8 | — | **assigned to an engineer** by the Director; body has interface expectations |
| isometric camera rig | #9 | — | **assigned to an engineer**; body has interface expectations |
| asset manifest + GLTF loader | #10 | — | **to be assigned**; blocked by #89 (placeholder GLBs) for seed data |
| ADRs 0001–0003 | #11 | — | next thing I write (see §4) |

Director instruction (2026-09-02): **clear the open-PR queue before starting any implementation chunk, and do not implement M0 items yourself any more**; engineers own #8, #9, #10. Reviews and ADRs are the job.

Merged from other roles today: studio charter (#1), style guide (#12), ADR 0004 tactical map contract (#14), mapgen map model (#88), concept sheets (#86, #96), placeholder GLB tooling (#89, pending CI rerun after a `.gitignore` conflict I resolved with a merge commit), handoffs (#15, #91, #92, #94).

## 2. Open PRs / issues I own

- #11 ADRs (not started). Everything else M0 is either merged or handed to engineers.

## 3. Decisions I made and why

- **TypeScript pinned to 6.x, not 7.** `typescript@7` ships no JS compiler API and typescript-eslint requires `<6.1`. Typed linting matters more than native `tsc` speed here. Revisit when typescript-eslint supports 7.
- **Layering is enforced by ESLint**, not convention: in `core save content overworld economy roster tactical bugs mapgen`, any `three` import, any import from `ui/ graphics/ app/`, and any DOM global is an error; `Math.random()` is an error everywhere except `src/core/service/random-seed.ts`. A negative test with all four violations was verified before landing.
- **`save/` composes the root `GameState`**, so it sits above simulation domains and below presentation. It still obeys the no-DOM rule: the `Storage` instance is injected by `app/` through `WebStorageKeyValueStore`.
- **`GameState` is `{ meta }` at schema v1.** M1 engineers add slices by adding the field, bumping `GAME_STATE_SCHEMA_VERSION`, and appending a `Migration` to `save/data/migrations.ts`.
- **Ids in `content/`, definitions in the owning domain.** Model ids (`content/data/model-ids.ts`) with the manifest in `graphics/data` typed `satisfies Record<ModelAssetId, ModelAssetEntry>`; biome and settlement id unions in `content/model`, full definitions in `mapgen/data`. Ruled on #10 and #19. Architecture §4 wording will be tightened in ADR 0002.
- **Labelled RNG forks** (`fork(label)`) are a pure function of (seed, label) and consume no parent state; the pipeline runner must assert unique pass ids. Agreed with MapGen on #14.
- **Scale**: 1 tile = 1 u = 2 m, one level = 1.5 u, terrain steps are whole levels. Camera: elevation `atan(1/√2)`, four yaws, 64 px per tile default, 40–128 range (style guide §2).
- **Preview harness** for mapgen is a second Vite HTML entry (`mapgen-preview.html` → `src/mapgen-preview.ts`), issue #33.
- **Prettier ignores Markdown** so docs PRs from other roles never fail lint on table alignment.
- **e2e runs against the Vite dev server** (not `vite preview`); `pnpm build` already validates the bundle. `body[data-app-state=ready]` is the boot hook tests wait on.

## 4. Next, in order

1. Merge #89 when CI is green (it was green before the conflict; only `.gitignore` changed).
2. Write ADRs 0001 toolchain, 0002 layering (including the `save/` position and the `content/` vocabulary rule), 0003 root state + command + event contract. Update `architecture.md` §3/§4/§8 to match. Issue #11.
3. Keep the review loop: poll every ~5 minutes; run `pnpm typecheck && pnpm lint && pnpm test` on every code PR before approving; fast-track `chore(handoff)` but glance at the file list (see gotcha below).
4. Watch the first engineer PRs on #8 and #9 for `SceneService` conflicts; whoever lands second rebases.
5. Add `chunkSizeWarningLimit` or a vendor chunk for three.js in `vite.config.ts` when someone touches it; the 500 kB warning is noise, not a failure.

## 5. Gotchas

- All agents share one GitHub account, so `gh pr review --approve` fails with "Can not approve your own pull request". Reviews are `gh pr comment` with a `**Verdict:**` line, then `gh pr merge N --squash --delete-branch`.
- `gh pr merge --delete-branch` also deletes your **local** branch. Do not stack a second branch on a branch you are about to merge; branch from `origin/main` after the squash lands instead. (I lost ten minutes to this on #87/#90.)
- `gh pr checkout` has no `-q` flag; `git cherry-pick` has no `-q` flag. Both fail silently inside `&&` chains with `tail`.
- `chore(handoff)` PRs sometimes carry tooling (#94 added `tools/producer/*.py`). Check the file list before fast-tracking.
- `import("playwright")` does not resolve under pnpm; use `@playwright/test`, which exports `chromium`.
- pnpm 11's minimum-release-age gate rewrites `pnpm-workspace.yaml` on `pnpm add`; commit it.
- Headless Chromium needs `--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader` for WebGL; already in `playwright.config.ts`.
- Codex image generation quirks are in `docs/handoff/art-director.md` §5.
