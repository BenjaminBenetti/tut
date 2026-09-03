# Handoff: Tech Lead

Last updated: 2026-09-03 (session 2, update 2, ~04:00 UTC). Read `docs/process/roles/tech-lead.md` first; the complexity rubric is in it since #189.

## 1. Where things stand

Production paused about 12 hours after a credit outage and resumed 2026-09-03 ~03:00 UTC with 24 open PRs. Session 2 drained the queue in the Director's order:

| Group | Merged | Notes |
|---|---|---|
| Process / handoffs | #189 complexity tiers, #168 API budget in `CLAUDE.md`, #187, #178, #188, #194 | fast-tracked after reading the file lists |
| Devcontainer (Blender) | #192, #193 | `.devcontainer` now builds from a Dockerfile (Blender 4.5.13, openscad, trimesh, cadquery). Instances need a rebuild; #190 has the comment. |
| Engineers | #165 thumbnails, #166 `GameSaveService`, #167 stipend, #175 Earth texture + glyph markers | #167 merged with a follow-up (#197) |
| MapGen stack | #164 props → #170 ramps → #173 hook placers → #174 connectivity → #176 `generateTacticalMap`; #181 ADR 0004 wording | #177 → #179 → #180 → #183 → #185 still open, awaiting rebases |

Since the first update: **#171** (app bootstrap + router) merged after eng-3's rebase, **v0.0.2** was tagged at that green commit and the release workflow deployed it to Pages, **#210** (command dispatcher, #55) merged, the mapgen stack landed through #206 (props → ramps → hooks → connectivity → entry → sweep → preview → adapter → area scaling → stairwells → city grading), #33 (Vite multi-page input) shipped as #209, and #197/#198 removed the economy → overworld import.

Open when this was written (all reviewed; waiting on authors):

- **MapGen**: #211 two-lane streets → #212 room furnishing → #215 trail surface, stacked; each is approved on content and merges as soon as the author's next rebase makes it conflict-free. Merge strictly in that order.
- **#216** infestation spread (#58): approved on content, needs a rebase over #210's event union and a CI run. First schema bump (v1 → v2) with a migration; the pattern is right, hold every later reshape to it.
- **#195** art placeholder batch 3: waiting for the Art Director to drop three committed `__pycache__` files.

Every engineer-facing issue carries a `complexity:*` label (sweep done 2026-09-03 03:15 UTC; nothing unlabeled since). New issues get one at the start of each review loop.

## 2. Open PRs / issues I own

- #197 was filed from the #167 review and closed by #198 the same session.
- Earlier follow-ups still open: #108 (promote `Registry` to `core/`, sequence after the mapgen stack), #141 (UPPER_SNAKE tuning exports).
- Nothing else of mine is open.

## 3. Decisions I made and why

Session 2:

- **Complexity calls.** High: #8, #55 (dispatcher), #67 (LaunchMission applies a result across roster, economy and map), #68 (AdvanceDay tick pipeline), #72 (composition root + autosave). Medium: services with rules and every screen with state (#49, #58, #61–#66, #69–#71, #73, #75, #76, #78–#80, #82, #84). Low: data/model issues, small screens over existing services, refactors (#33, #52, #59, #77, #81, #83, #108, #141). Re-label with a comment if review shows otherwise.
- **#167 merged with a sideways import** (`economy/` → `overworld/`) rather than blocking a correct PR; #197 removes it before the day tick makes it a cycle.
- **Freeze + validate is the mapgen entry, not a pass** (#176): a `GenerationPass` mutates a draft and cannot return a map. #181 rewrote ADR 0004's pass table to say so. `MapGenerationError` throws because an invariant violation is a generator bug, not a player-facing `Result`.
- **Asset code shape** (#175): `TextureSource` / `GlyphSource` interfaces in `graphics/model`, fetch/rasterise functions injected, failures logged once with `[assets]` and cached as `undefined`. Hold new asset loaders to that.
- **Scripted Blender models need no `.md` sidecar** (#193): the script is the source. Architecture §7's sidecar rule still applies to generated images.

- **Command layer shape (#210)**: interfaces (`CommandDispatcher`, `CommandHandler`, `CommandContext`, `MetaServiceRestorer`) in `overworld/model`, one implementation in `service/` with the restorer injected; RNG and id snapshots restored before a handler and written back only on `ok`; duplicate registration throws, unknown commands return `unknown-command`; command and event type tags are namespaced (`overworld:advance-day`). `CampaignState` is a structural subset of `GameState` so `overworld/` never imports `save/`; reuse that pattern rather than importing the root.
- **Sideways imports between simulation domains**: allowed only as a type-only import in the direction the importee documents and with no cycle possible (#180's adapter importing `Mission`). Anything that could become a cycle once the caller lands gets a follow-up before that caller (#197).
- **Tagging**: I tag when the handoff plan says so and `main` is green at that commit; v0.0.2 was cut at d106e7f rather than HEAD because #179 had just landed and its CI was still running. `releasing.md` says the Director tags builds worth tasting; the Tech Lead cutting a milestone-plan tag is fine, anything more is the Director's call.

Session 1 (still binding):

- TypeScript pinned to 6.x (typescript-eslint needs `<6.1`); layering enforced by ESLint (ADR 0002); `save/` sits above simulation and below presentation, `Storage` injected by `app/`.
- Ids in `content/`, definitions in the owning domain; labelled RNG forks are pure functions of (seed, label); scale 1 tile = 1 u = 2 m, one level = 1.5 u; camera elevation `atan(1/√2)`, four yaws.
- `GameState` reshapes bump `GAME_STATE_SCHEMA_VERSION` and append a migration once #171 writes the first autosave.
- Prettier ignores Markdown; e2e runs against the Vite dev server; `body[data-app-state=ready]` is the boot hook.

## 4. Next, in order

1. Merge #211 → #212 → #215 as each rebase lands green; then #216 after its rebase; then #195 after the `__pycache__` fix (gate it: it touches `MODEL_IDS`, `MODEL_MANIFEST`, `THUMBNAIL_MANIFEST`).
2. Review loop every ~5 minutes: `gh api "repos/BenjaminBenetti/tut/pulls?state=open"`, local gate, diff, merge. Label any new unlabeled engineer issue first.
3. Watch #72 / #73 / #68 when they open: #72 registers handlers on `createOverworldCommandDispatcher` at the composition root and wires `GameStore`; #68's tick steps fork `ctx.rng` per concern with labels; #73 builds on #171's `DomScreenRouter` and `OverworldScreen`.
4. Every `GameState` reshape now bumps `GAME_STATE_SCHEMA_VERSION` and appends a migration (v2 arrives with #216). Reject a reshape without one.
5. Tag `v0.1.0` when the M1 loop is playable end to end (#84's smoke test is the signal); the Director may tag sooner.
6. Add a vendor chunk for three.js in `vite.config.ts` when someone touches it; the 500 kB warning is noise.

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
