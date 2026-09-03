# Handoff: Tech Lead

Last updated: 2026-09-02 (session 1, late). Read `docs/process/roles/tech-lead.md` first.

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
| ADRs 0001–0003 | #11 | #128 | merged; `architecture.md` and `CLAUDE.md` updated |
| Release pipeline: tag → GitHub Release + Pages | #127 | #135 | merged; proven with `v0.0.1`, live at https://benjaminbenetti.github.io/tut/ |

Director instruction (2026-09-02): **clear the open-PR queue before starting any implementation chunk, and do not implement M0 items yourself any more**; engineers own #8, #9, #10. Reviews and ADRs are the job.

Engineer PRs merged today (all green, all reviewed against ADR 0003): economy #100/#130, roster #103/#104/#126, overworld #115/#131/#134/#147/#149, content #125, app store #132, camera rig #118 (issue #9), asset manifest + loader #148 (issue #10), **GameState root + new-game factory #153 (issue #54)**. MapGen: #88, #99, #113, #120, #129, #138, #139, #150, #154 (passes 1–5 plus the draft freezer). Art: #109/#114 theme + icons, #110/#121/#133/#151/#152 assets and concepts. Process: #117 seat model.

Still open from M0: #8 (app bootstrap + router, seat eng-3). Everything else in M0 is merged; the release pipeline (#127) is live at https://benjaminbenetti.github.io/tut/ (tag `v0.0.1`).

Merged from other roles earlier: studio charter (#1), style guide (#12), ADR 0004 tactical map contract (#14), mapgen map model (#88), concept sheets (#86, #96), placeholder GLB tooling (#89, pending CI rerun after a `.gitignore` conflict I resolved with a merge commit), handoffs (#15, #91, #92, #94).

## 2. Open PRs / issues I own

- Nothing open. Follow-ups I filed for engineers: #108 (promote generic `Registry` to `core/`), #141 (rename scalar tuning exports to `UPPER_SNAKE`).
- Process: engineers occupy seats `eng-1..6`; the Producer assigns via `seat:eng-N` labels (#117). I advise on sequencing in issue comments and may veto.

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

1. Keep the review loop: poll every ~5 minutes; run `pnpm typecheck && pnpm lint && pnpm test` on every code PR before approving; fast-track `chore(handoff)` but glance at the file list.
2. Watch #8 (app bootstrap + router) and #10 (asset manifest + loader) when they open: they touch `main.ts` / `SceneService`; whoever lands second rebases. #10 must seed 51 ids from `tools/art/placeholders.manifest.json`.
3. `GameState` now has `overworld`, `roster`, `economy` slices (#153) at schema v1 with no persisted saves yet. **From the moment #8 writes an autosave, every reshape bumps `GAME_STATE_SCHEMA_VERSION` and appends a migration.** Hold that line in review; #56 (save round trip) is where it starts to matter.
4. Tag `v0.0.2` once #8 lands so the Executive Director can click through a menu; the Director may tag sooner.
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
- GitHub auto-creates the `github-pages` environment allowing `main` only; a tag-triggered deploy is refused until a `v*` tag policy is added (done; see `docs/process/releasing.md`). The Release job is independent and succeeds regardless.
- Engineers sometimes stack a PR on an unmerged sibling branch; after the sibling squash-merges, GitHub's diff still shows the sibling's files but the merge is clean because the content is identical. Check `additions` against the PR body before worrying.
- The Pages site is public to anyone with the URL although the repo is private.
- The 5,000/hr GitHub API limit is shared by every agent on the account; GraphQL can be exhausted while REST still has budget. `gh pr view/checks/diff/list/merge` use GraphQL. REST fallbacks that kept the loop running: `gh api repos/O/R/pulls?state=open`, `gh api repos/O/R/pulls/N -H "Accept: application/vnd.github.v3.diff"`, `gh api repos/O/R/commits/SHA/check-runs`, `gh api -X POST repos/O/R/issues/N/comments -f body=…`, `gh api -X PUT repos/O/R/pulls/N/merge -f merge_method=squash`, `gh api -X DELETE repos/O/R/git/refs/heads/BRANCH`; check out with `git fetch origin BRANCH && git checkout -B BRANCH origin/BRANCH`.
- Review conventions applied today and worth repeating: interfaces in `model/`, implementations in `service/` or `repository/`; nothing under `content/` (tests included) imports a consuming domain; placeholder types for an in-flight sibling issue must be swapped for the real import when the sibling merges (#153 ↔ #149).
