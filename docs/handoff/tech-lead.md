# Handoff: Tech Lead

Last updated: 2026-09-03 (session 2, early). Read `docs/process/roles/tech-lead.md` first; the complexity rubric is in it since #189.

## 1. Where things stand

Production paused about 12 hours after a credit outage and resumed 2026-09-03 ~03:00 UTC with 24 open PRs. Session 2 drained the queue in the Director's order:

| Group | Merged | Notes |
|---|---|---|
| Process / handoffs | #189 complexity tiers, #168 API budget in `CLAUDE.md`, #187, #178, #188, #194 | fast-tracked after reading the file lists |
| Devcontainer (Blender) | #192, #193 | `.devcontainer` now builds from a Dockerfile (Blender 4.5.13, openscad, trimesh, cadquery). Instances need a rebuild; #190 has the comment. |
| Engineers | #165 thumbnails, #166 `GameSaveService`, #167 stipend, #175 Earth texture + glyph markers | #167 merged with a follow-up (#197) |
| MapGen stack | #164 props → #170 ramps → #173 hook placers → #174 connectivity → #176 `generateTacticalMap`; #181 ADR 0004 wording | #177 → #179 → #180 → #183 → #185 still open, awaiting rebases |

Still open when this was written:

- **#171** app bootstrap + router (#8, seat eng-3): approved in design, **changes requested**: rebase onto `main` (conflicts in `index.html` / `src/main.ts` because #160 and #175 changed the entry point), carry today's `main.ts` overworld composition into `composeScene`, adopt `createGameSaveService` from #166, and get CI to run (no check suite ever ran on c4e7bf6). Merge as soon as it is green; it gates every M1 UI issue.
- **MapGen stack** #177, #179, #180, #183, #185: each contains its predecessors' commits and merges clean only once the predecessor's squash is in its base. The MapGen agent rebases with `--update-refs` within minutes of each squash; re-gate at the new head and merge in order.

Every engineer-facing issue now carries a `complexity:*` label (sweep done 2026-09-03). New issues get one at the start of each review loop.

## 2. Open PRs / issues I own

- #197 `refactor(economy): computeStipend takes the unfested fraction, not the EarthMap` (complexity:low). Filed from the #167 review; land before #68 wires the first caller.
- Earlier follow-ups still open: #108 (promote `Registry` to `core/`, sequence after the mapgen stack), #141 (UPPER_SNAKE tuning exports).
- No handoff or ADR PRs of mine open besides this one.

## 3. Decisions I made and why

Session 2:

- **Complexity calls.** High: #8, #55 (dispatcher), #67 (LaunchMission applies a result across roster, economy and map), #68 (AdvanceDay tick pipeline), #72 (composition root + autosave). Medium: services with rules and every screen with state (#49, #58, #61–#66, #69–#71, #73, #75, #76, #78–#80, #82, #84). Low: data/model issues, small screens over existing services, refactors (#33, #52, #59, #77, #81, #83, #108, #141). Re-label with a comment if review shows otherwise.
- **#167 merged with a sideways import** (`economy/` → `overworld/`) rather than blocking a correct PR; #197 removes it before the day tick makes it a cycle.
- **Freeze + validate is the mapgen entry, not a pass** (#176): a `GenerationPass` mutates a draft and cannot return a map. #181 rewrote ADR 0004's pass table to say so. `MapGenerationError` throws because an invariant violation is a generator bug, not a player-facing `Result`.
- **Asset code shape** (#175): `TextureSource` / `GlyphSource` interfaces in `graphics/model`, fetch/rasterise functions injected, failures logged once with `[assets]` and cached as `undefined`. Hold new asset loaders to that.
- **Scripted Blender models need no `.md` sidecar** (#193): the script is the source. Architecture §7's sidecar rule still applies to generated images.

Session 1 (still binding):

- TypeScript pinned to 6.x (typescript-eslint needs `<6.1`); layering enforced by ESLint (ADR 0002); `save/` sits above simulation and below presentation, `Storage` injected by `app/`.
- Ids in `content/`, definitions in the owning domain; labelled RNG forks are pure functions of (seed, label); scale 1 tile = 1 u = 2 m, one level = 1.5 u; camera elevation `atan(1/√2)`, four yaws.
- `GameState` reshapes bump `GAME_STATE_SCHEMA_VERSION` and append a migration once #171 writes the first autosave.
- Prettier ignores Markdown; e2e runs against the Vite dev server; `body[data-app-state=ready]` is the boot hook.

## 4. Next, in order

1. Merge the mapgen stack as each PR is rebased and green (#177 → #179 → #180 → #183 → #185). #177 re-pins golden checksums and moves `UnionFind` to `service/ground-components.ts`; #179 adds the second Vite entry (closes #31 and should close #33).
2. Merge #171 once rebased and green; then tag `v0.0.2` so the Executive Director can click through the menu (`docs/process/releasing.md`).
3. Review loop every ~5 minutes: `gh api "repos/BenjaminBenetti/tut/pulls?state=open"`, local gate, diff, merge. Label any new unlabeled issue first.
4. Watch #72 / #73 when they open: they must build on #171's `DomScreenRouter` and `GameSession`, and on `GameStore` (#47) once #55's dispatcher exists.
5. Add a vendor chunk for three.js in `vite.config.ts` when someone touches it; the 500 kB warning is noise.

## 5. Gotchas

- **Stacked PRs conflict when a later PR modifies a file its predecessor added.** Identical adds on both sides merge clean; an add on `main` (the squash) versus add-plus-edit on the branch is an add/add conflict and GitHub answers 405 "merge conflicts". Wait for the author's rebase; never rebase a branch you do not own.
- **REST merge with a head guard**: `gh api -X PUT repos/O/R/pulls/N/merge -f merge_method=squash -f sha=<head>` refuses if the author pushed between your gate and the merge. Use it on every merge.
- **Local gate script**: fetch, `checkout -B`, `pnpm install --frozen-lockfile` only if the lockfile changed, then typecheck / lint / test and print the three exit codes. Runs in ~13 s. Gate on exit codes, never on `tail`.
- **Check-runs can be empty** for a head pushed during an outage (#171 had only a queued third-party suite). Ask for a new push rather than merging on a green local gate.
- The harness prints a "GitHub API rate limit exceeded" reminder whenever that phrase appears in a tool result, including inside a diff of `CLAUDE.md`. Check `gh api rate_limit` before believing it.
- All agents share one GitHub account: `gh pr review --approve` fails; reviews are comments with a `**Verdict:**` line. `gh pr merge --delete-branch` also deletes the local branch. `gh pr checkout` and `git cherry-pick` have no `-q`.
- `chore(handoff)` PRs sometimes carry tooling (#188 shipped `tools/producer/*.py`). Read the file list before fast-tracking.
- `import("playwright")` does not resolve under pnpm; use `@playwright/test`. Headless Chromium needs `--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader`.
- pnpm 11's minimum-release-age gate rewrites `pnpm-workspace.yaml` on `pnpm add`; commit it.
- The 5,000/hr API limit is shared by every agent; GraphQL runs out first. REST paths that keep the loop running: `pulls?state=open`, `pulls/N/files`, `pulls/N` with the diff Accept header, `commits/SHA/check-runs`, `issues/N/comments`, `pulls/N/merge`, `git/refs/heads/BRANCH`; check out with `git fetch origin BRANCH && git checkout -B BRANCH origin/BRANCH`.
- The Pages site is public to anyone with the URL although the repo is private.
