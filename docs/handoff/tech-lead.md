# Handoff: Tech Lead

Last updated: 2026-09-04 (session 3, update 4, ~04:35 UTC). Read `docs/process/roles/tech-lead.md` first; the complexity rubric is in it since #189.

## 1. Where things stand

Production paused about 12 hours after a credit outage and resumed 2026-09-03 ~03:00 UTC with 24 open PRs. Session 2 drained the queue in the Director's order:

| Group | Merged | Notes |
|---|---|---|
| Process / handoffs | #189 complexity tiers, #168 API budget in `CLAUDE.md`, #187, #178, #188, #194 | fast-tracked after reading the file lists |
| Devcontainer (Blender) | #192, #193 | `.devcontainer` now builds from a Dockerfile (Blender 4.5.13, openscad, trimesh, cadquery). Instances need a rebuild; #190 has the comment. |
| Engineers | #165 thumbnails, #166 `GameSaveService`, #167 stipend, #175 Earth texture + glyph markers | #167 merged with a follow-up (#197) |
| MapGen stack | #164 props → #170 ramps → #173 hook placers → #174 connectivity → #176 `generateTacticalMap`; #181 ADR 0004 wording | #177 → #179 → #180 → #183 → #185 still open, awaiting rebases |

Since the first update the queue has stayed near empty: everything an author finishes merges within one or two five-minute polls. Landed in session 2 (about 55 PRs): v0.0.2 on Pages; app bootstrap (#171) and the composition root with autosave, Export/Import and the seed box (#229); the command dispatcher (#210); overworld services for spread (#216, first schema bump v1 → v2), deployables (#207, #241), the lose condition (#248); roster loadout validation (#220); the whole MapGen M1.5 stack through city grading, two-lane streets, room furnishing, vegetation clusters, hatch space, map metrics, apartments, the wide sweep and two crash fixes; ADR 0004 realigned twice (#181, #251); art batch 3 (#195) and the Blender kit (#193, #214); QA's promoted e2e checks (#225).

Between 04:45 and 09:05 the M1 simulation loop closed and the first real screens landed. Merged: #216 spread, #241 deployable effects, #248 lose condition, #254 auto-resolve, #238 mission generation (v2 → v3 migration for `City.scale`), #243 roster service, #265 AdvanceDay pipeline, #268 augmentable command/event maps (#246), #279 casualties and repair (v3 → v4 for `graveyard`), #285 deployable commands, #289 LaunchMission, #295 part upgrades, #220 loadout validation; screens #282 overworld shell, #290 roster, #293 city panel; mapgen #206 → #276 plus fixes; art #264, #277, #280 (Mech A set as Blender models); QA e2e promotions #225, #257. The team stalled on the usage limit 05:00–07:40; the Producer's chase note on #243 is what the queue looked like at resume.

**Incident #262 (main red, 04:51–04:57):** #238 made `City.scale` required; #254 was gated and CI-checked at its own head, which predated #238's squash, and its two test fixtures lacked the field. Fixed in #263 within six minutes. Process change: the gate now merges `origin/main` into the branch locally before typecheck/lint/test (see §5). It has since caught two more of the same kind before they merged (#285's fixtures without `graveyard`; #289 and #295 disagreeing on the `LoadoutMechRater` constructor), each fixed by the author in one push.

**Composition-root churn.** `app/service/game-composition.ts` is the remaining hand-edited hot spot: #243, #265, #285, #289, #290 and #295 each register something there, and five of them needed a second merge of `main`. The conflicts are small (adjacent registration blocks) and authors resolve them in minutes; I chose not to file a refactor. Tell the next author to merge `main` right before pushing and merge whatever is ready without waiting.

Between 09:05 and 09:55 the M1 UI finished except #77 (event dialog), #83 (results screen body) and #84 (QA smoke): #298 game-over screens, #300 mission list with one `OverworldSelection` model, #301 + #310 mech bay, #306 + #312 events (generation, expiry, resolution), #315 deployment screen with a resolver-side `DeploymentAssessor`, #313 map markers following campaign state, and the Blender replacement track #277 → #288 (every unit model is now a scripted Blender model; the placeholder pipeline owns none). The Producer decomposed **M2 Basic Missions** into #316–#345 (five epics, 24 engineer issues); all 24 are tiered.

**Session 3 (from 12:42 UTC).** The fleet stalled 09:58–12:41 on the shared usage limit; the queue at resume was #346 (#307 threat offset, already approved on content by session 2), #348 and #349 (handoffs). All three merged within ten minutes, then the first poll brought five more which merged inside the same tick: #353 `Tile.blocksLos` and #355 `hatchTiles` + `snapshotMap` (MapGen's two M2 API PRs), #350 `prop.table` Blender model, #351 event dialog (#77, the last child of #41), #356 MapGen handoff. `main` is cfa55cc, green, typechecks locally after every merge.

**M1 epics closed by me:** #35, #36, #37, #38, #39, #40 (every child closed; checked against the open-issue set, 56 issues on one page), then #41 after #351. Only #42 remains: #83 results screen, #84 e2e smoke. **#357** (QA, `complexity:low`): after Continue from mission results the overworld renders blank because `OverworldScreen.render` clears the stale mission selection and returns before subscribing; QA's diagnosis is exact and the fix is one re-render. It blocks #84's spec, so it goes before the tag.

**13:00–13:47.** M1 finished: #358 results screen (Continue advances the day per #83; it also fixed QA's #357), #359 QA's `overworld-loop.spec.ts` (#84), #367 squad-rating tuning (#336). Epics #41 and #42 closed, so every M1 epic is closed. **`v0.1.0` tagged at 0a81e0f** (release workflow: verify, GitHub Release, Pages all green); QA and the Producer were told on #84 and #371. M2 started landing: #360 unit model (#321), #363 species (#322), #366 tactical scene (#337), #374 tactical input controller (#340); #375 fixed QA's #217 with a `NoticeSink` bar outside the router.

**CI fix (#364):** `overworld-tick.spec.ts` clicked Advance Day on a random seed; since #351 an event disables the button, so it flaked (one in thirty-one locally). Pinned seed 777 and the same answer-the-dialog guard the other specs use. **Lint fix (#373):** `tactical/` had imported `GameState` from `save/` through a green lint because the layering rule only banned `ui`, `graphics`, `app`; simulation domains below `save/` now reject `**/save/**` (tests excluded), ADR 0002 §2.2 has the row.

**13:47–17:52 (with a fleet stall 15:45–17:41).** M2 landed most of its runtime and rules: #372 (#323 mission state, v6), #382 (#324 commands and events on the campaign dispatcher), #385 (#326 sight and cover), #388 (#327 hit chance and damage), #390 (#325 movement), #389 (#342 tactical screen and `composeTactical`), #391 (#339 mission HUD), plus #377 (#369 one picking controller), #375/#383/#379/#380/#386/#392 (QA bugs #217, #219, #218, #291, #368, #304; #304 bumped the schema to v7). Epic #316 closed. Remaining high chain on eng-3: #328 turn engine → #330 resolver → #341 flow; medium seats on #338, #329, #331. Every merge gated on the tree merged with `main`; nothing merged red.

**Overnight (17:52 → 04:15 the fleet was stalled; it woke at 04:16).** Merged before the stall: #402 overlays and the animation queue (#338), #401 default squad names (#294), #405/#397/#411/#413/#417/#419/#421 handoffs, #406 one status row (#403), #410 shared `isRecord` (#230), #408 turn engine (#328), #414 behaviour registry (#331), #415 charges (#409), #416 spawning (#329), #418 lurker (#333), #407 the Art Director's scene preview.

**The Executive Director filed #420 at 20:10 UTC and it sat unanswered for eight hours** because every agent was stalled. Read it first if you are new: the human is the vision holder and their issues outrank the board. It asked for the strategic map "more flat front on, just like XCOM" and for city markers that line up with their cities. I took it myself rather than seating it (camera rig and architecture §5 are Tech Lead territory; all three seats were on the M2 critical path) and shipped it as #423, with **ADR 0005** and before/after renders committed at `docs/design/overworld-camera-before.png` / `-after.png`. The Producer had raised it to p0 and scoped it to the overworld; both calls were right.

**What #420 taught, worth keeping:** the strategic scene was written assuming a tilted camera, so world `+y` read as screen-up. Under a top-down camera `+y` points at the viewer and moves nothing on screen. Anything drawn on the strategic map must now offset across the **ground plane**; the mission badge and the marker glyph both had to change, and the marker glyph being a bottom-anchored sprite is what made markers look misaligned in the first place (a bottom-anchored sprite always draws a full glyph-height above its anchor). Region label bars are the next thing that will hit this if they are ever drawn in 3D.

Open when this was written: **#422** (#335 bug-phase runner) approved on content, holding for one line that registers `LurkerBehaviour` in `shippedBugBehaviours()`, since #418 landed it as dead code.

Superseded note, kept for the record: **#372** (#323 tactical state, eng-3) with changes requested: (1) no `save/` import, generic over a structural `MissionCampaignState` like the tick steps; (2) inline map accepted but ADR 0004 decision 9 must say so in the same PR; (3) `- 6:` schema history line; (4) `registries` injected, not defaulted. Gate and merge when the push lands and `pnpm lint` passes under #373.

**M2 ruling (on #324, referenced from #342):** tactical commands and events augment the campaign's maps (`OverworldCommandMap` / `OverworldEventMap`) exactly as #246 set up; handlers lift `state.activeMission`, use `ctx.rng` / `ctx.ids`, and return a typed `no-active-mission` error when there is no mission. One `GameStore`, one autosave, one event stream; no `TacticalStore`. Tactical services stay pure over `TacticalState` so the headless sim (#343) drives them without a store. Hold #324, #342 and #341 to this.

**M2 tiers:** high #323, #324, #325, #326, #328, #330, #341 (the critical path, serial on the one default-effort seat unless the Director adds one); medium #321, #327, #329, #331, #333, #335, #337, #338, #339, #340, #342, #343; low #322, #332, #334, #344, #345. Noted for the Producer on #317.

**#323 is a save reshape** (`GameState.activeMission` gains `TacticalState`): v4 → v5 with a migration, same recipe as #216/#238/#279. Reject it without one.

Every engineer-facing issue carries a `complexity:*` label (checked every poll; five new issues labelled during the session).

## 2. Open PRs / issues I own

- #336 `tuning: squad combat ratings vs auto-resolve difficulty scale` (complexity:low, after #84) filed from an observation on #315. #307 shipped in #346 (Director chose the persistent offset; v4 → v5 `ADD_THREAT_OFFSET`).
- #197 (filed from #167) closed the same session via #198. #246 `refactor(overworld): derive the command and event unions from augmentable maps` (complexity:medium) is mine: four PRs in one hour needed a second merge of `main` purely for the union line; module augmentation removes the shared line.
- Earlier follow-ups still open: #108 (promote `Registry` to `core/`, sequence after the mapgen stack), #141 (UPPER_SNAKE tuning exports).
- Nothing else of mine is open.

## 3. Decisions I made and why

Session 3, 2026-09-04:

- **The strategic map is top-down, the tactical map stays isometric** (ADR 0005, from the Executive Director's #420). Projection is state (`CameraProjection { elevationRad, yawOffsetRad }`) rather than a module constant, defaulting to isometric so nothing written before it moved. The elevation is one number if the Executive Director ever wants a tilt back.
- **A human's issue is answered the same tick it is found, before any queue work.** #420 waited eight hours through a stall. When you see one, reply with your reading of it before you write code, so they can correct you cheaply, and put a rendered screenshot in front of them rather than asking them to read a diff.
- **I self-merge Tech Lead architecture and CI PRs** (#364, #373, #423) since nobody else can review them, and I say so in a comment on the PR rather than doing it quietly.
- **Bug-phase re-entrancy (#422 corrected me).** I had written on #412 that the runner should dispatch through the campaign dispatcher and then send `EndTurn`; that means a handler re-entering the dispatcher and a command the player never sent. The right shape, which shipped, is a pure `PhaseStep` that `EndTurn` composes, so one end of turn hatches, waves, plays the bugs and hands back the next player turn as one command, one autosave, one event batch. Take engineer pushback seriously; that one was right and I was wrong.
- **Tuning lives in `<domain>/model` and `<domain>/data`** even for AI weights (#418 was sent back for keeping `LURKER_TUNING` inside the behaviour module), so #345's tuning pass has one place to look.

Session 3:

- **Simulation never imports `save/`, now lint-enforced (#373).** A service that needs the root types it structurally (`CampaignState`, or a `TState extends CampaignState` generic), and `save/` composes the slice. Tests may import `save/` for fixtures.
- **`activeMission` stores the frozen `TacticalMap` inline** (ruling on #372, to be written into ADR 0004 decision 9 by that PR). The generator is deterministic within a build, not across builds (goldens re-pin with every tuning PR), so a recipe-only mid-mission save would move tiles under the player after an update; the slot is absent between missions so campaign saves stay small; `map.recipe` remains the provenance.
- **Presentation pointer input composes `graphics/controller/PickingController<TId>`** (#366) through a `Picker<TId>` adapter; no second copy of the press/release/slop rules (#374 was sent back for one and came back composed). `ui/` imports no three.js; the camera type reaches `ui/` through the `Picker` signature. #369 folds the overworld's `MapPickingController` onto the same controller.
- **Continue on the results screen advances the day** (#83's acceptance criteria and GDD §3); QA's #359 was corrected to expect it rather than the PR changed.
- **Tuning changes ship with their design targets as tests** (#367): one difficulty point equals a full rifle squad, pinned by `auto-resolve-tuning.test.ts`, and the tactical per-rating damage factor was rescaled so unit damage stayed identical.
- **Group registrations on the campaign maps live in their own module** (#382): `tactical/model/tactical-event-group.ts` augments `OverworldEventMap` with `tactical: TacticalEvent`; augmenting from `tactical-event.ts` itself trips TS2664 because the member type derives from the map declared in that file. Direction is `tactical → overworld` only; `overworld/` never mentions `tactical/`.
- **One tactical registration site:** `shippedTacticalHandlers()` in `app/service/tactical-composition.ts`, the default `handlers` of `composeTactical`; the composition test asserts the registered set (`[ATTACK, MOVE]` today). A rules PR adds one line there. #388 had registered in `composeGame` directly and #389 moved it; no second site.
- **One `TacticalScreen`** (#389's, with the `TacticalSceneHost` interface in `ui/model` and the three.js composition in `app/service/tactical-scene-host.ts`). #391 arrived with a second screen and was sent back to mount `TacticalHudView` inside main's through its intent sink; that is the pattern for #338/#341: presentation additions mount into the screen, they do not replace it.
- **Rules are pure over `TacticalState` with injected tuning** (`CombatTuning`, `UnitTuning` in `model/`, defaults in `data/`); `previewAttack` and `resolveAttack` share one validation so the HUD shows exactly what is rolled; the lifted handler's fork label is `tactical:<mission>:<turn>:<phase>:<log.length>:<type>` and a handler that draws randomness must emit at least one event (#343's sim should assert it). Tunables recorded for the Director: doors opaque to sight, 45° flank cone, `EYE_HEIGHT` 0.5, attacks end the turn, allies block passage.
- **Test helpers carry the `.test-helper.ts` suffix** (`movement-fixtures.test-helper.ts`, `mission-hud.test-helper.ts`); the `save/` lint exclusion keys on it.
- **Tagging:** a `main` commit superseded within a minute gets no check runs at all (not cancelled, none), so tag whichever `main` HEAD first reports green rather than waiting on a specific squash. `v0.1.0` went on 0a81e0f, one tuning commit after the #84 squash.

Session 2:

- **Complexity calls.** High: #8, #55 (dispatcher), #67 (LaunchMission applies a result across roster, economy and map), #68 (AdvanceDay tick pipeline), #72 (composition root + autosave). Medium: services with rules and every screen with state (#49, #58, #61–#66, #69–#71, #73, #75, #76, #78–#80, #82, #84). Low: data/model issues, small screens over existing services, refactors (#33, #52, #59, #77, #81, #83, #108, #141). Re-label with a comment if review shows otherwise.
- **#167 merged with a sideways import** (`economy/` → `overworld/`) rather than blocking a correct PR; #197 removes it before the day tick makes it a cycle.
- **Freeze + validate is the mapgen entry, not a pass** (#176): a `GenerationPass` mutates a draft and cannot return a map. #181 rewrote ADR 0004's pass table to say so. `MapGenerationError` throws because an invariant violation is a generator bug, not a player-facing `Result`.
- **Asset code shape** (#175): `TextureSource` / `GlyphSource` interfaces in `graphics/model`, fetch/rasterise functions injected, failures logged once with `[assets]` and cached as `undefined`. Hold new asset loaders to that.
- **Scripted Blender models need no `.md` sidecar** (#193): the script is the source. Architecture §7's sidecar rule still applies to generated images.

- **Command layer shape (#210)**: interfaces (`CommandDispatcher`, `CommandHandler`, `CommandContext`, `MetaServiceRestorer`) in `overworld/model`, one implementation in `service/` with the restorer injected; RNG and id snapshots restored before a handler and written back only on `ok`; duplicate registration throws, unknown commands return `unknown-command`; command and event type tags are namespaced (`overworld:advance-day`). `CampaignState` is a structural subset of `GameState` so `overworld/` never imports `save/`; reuse that pattern rather than importing the root.
- **Sideways imports between simulation domains**: allowed only as a type-only import in the direction the importee documents and with no cycle possible (#180's adapter importing `Mission`). Anything that could become a cycle once the caller lands gets a follow-up before that caller (#197).
- **Save reshapes always migrate.** #216 set the pattern (bump `GAME_STATE_SCHEMA_VERSION`, append a `Migration`, chain test); #238 was sent back for adding a required `City.scale` without one. The only exceptions accepted: a field that was optional and never written (#248's `outcome` retype) or an array that is empty in every save (#207's `Deployable`).
- **Union hot spot.** `OverworldDomainEvent` and `OverworldCommand` are hand-written unions; every event/command PR edits the same lines. Until #246 lands, merge union-touching PRs one at a time and tell the next author to merge `main` after the previous one is in.
- **Performance is a review gate for mapgen.** #235 was sent back when the sweep timed out on CI (runners are about half our speed); the fix was to evaluate the expensive check lazily in draw order, not to raise the timeout.

- **Tagging**: I tag when the handoff plan says so and `main` is green at that commit; v0.0.2 was cut at d106e7f rather than HEAD because #179 had just landed and its CI was still running. `releasing.md` says the Director tags builds worth tasting; the Tech Lead cutting a milestone-plan tag is fine, anything more is the Director's call.

Session 1 (still binding):

- TypeScript pinned to 6.x (typescript-eslint needs `<6.1`); layering enforced by ESLint (ADR 0002); `save/` sits above simulation and below presentation, `Storage` injected by `app/`.
- Ids in `content/`, definitions in the owning domain; labelled RNG forks are pure functions of (seed, label); scale 1 tile = 1 u = 2 m, one level = 1.5 u; camera elevation `atan(1/√2)`, four yaws.
- `GameState` reshapes bump `GAME_STATE_SCHEMA_VERSION` and append a migration once #171 writes the first autosave.
- Prettier ignores Markdown; e2e runs against the Vite dev server; `body[data-app-state=ready]` is the boot hook.

## 4. Next, in order

1. Review loop every ~5 minutes (session 3 runs it as a cron job in the session; a tick is one `pulls?state=open` call, one `issues?state=open` sweep, then per-PR files/diff/check-runs); label any new unlabeled engineer issue first. MapGen's self-filed issues (#352, #354) went unlabelled on purpose: the specialist works them, the Producer never routes them.
2. **Schema is at v10** (v9 `ADD_UNIT_CHARGES` #409, v10 `ADD_SPAWN_CLOCKS` #329). Two PRs took the same version number within twenty minutes; when that happens, the one that merges second renumbers and the chain test catches it. Check `GAME_STATE_SCHEMA_VERSION` before approving any save reshape.
3. M1 is done and tagged. M2 order on eng-3 (updated 17:52: #323–#327 merged): #372 (#323) → #324 commands (hold to the ruling above: campaign dispatcher, `no-active-mission` error, one store) → #325 → #326 → #328 → #330 → #341. #324 must narrow `TacticalState.log` to the tactical event union and pass the dispatcher's `ctx.ids` into `startTacticalMission`. Medium seats: #338/#339/#342 as their inputs land, QA bugs (#219, #218, #291, #294, #304, #368), #369, #230.
3. M2 reviews: #321/#322 (models, data) will come first; then #323 (insist on the v4 → v5 migration and on `activeMission` being plain data); then #324 against the ruling above. `tactical/` must not import `graphics/`, `ui/` or `app/` (ESLint enforces it) and must not read `Math.random()` or `Date`.
4. Composition-root churn continues to be the one hot spot (`app/service/game-composition.ts`, `app-bootstrap.ts`, `ui/model/screen.ts`, `screens.css`): tell the next author to merge `main` right before pushing; merge whatever is ready without waiting for siblings.
5. #336 tuning after #84; #307 after the Director's decision.
6. Add a vendor chunk for three.js in `vite.config.ts` when someone touches it; the 500 kB warning is noise.

## 5. Gotchas

- **Gate script** (`review.sh BRANCH` in the scratchpad, rebuilt each session): `git fetch origin BRANCH main`, `checkout -B`, `git merge --no-edit origin/main` (abort on conflict), install only if the lockfile differs from `main`, then typecheck / lint / test to log files and print the three exit codes. The first draft passed `origin` twice to `git fetch` and failed with "couldn't find remote ref origin"; the refspec is `origin BRANCH main`.
- **A conflicting PR gets no CI run** (no merge ref), so empty check runs on a PR that touches files another PR just added usually mean a conflict, not an outage; `git merge-tree --write-tree --name-only origin/main origin/BRANCH` lists the files.
- **Every spec that clicks Advance Day answers the event dialog first** (`[data-role="event-dialog"] [data-choice-id]` visible → click the first choice → expect the button enabled). A new overworld spec without that guard will flake.
- **A red e2e on a docs-only PR is `main`'s problem:** reproduce with `pnpm test:e2e` on `main` before blaming the PR; the job log endpoint (`actions/jobs/ID/logs`) returns a redirect `gh api` does not follow, so local reproduction is faster than reading CI logs.
- **Epic closure check without per-issue calls:** one `issues?state=open&per_page=100` fetch (confirm the count is under 100), then diff each epic's child list against it; a child not in the open set is closed.

- **Stacked PRs conflict when a later PR modifies a file its predecessor added.** Identical adds on both sides merge clean; an add on `main` (the squash) versus add-plus-edit on the branch is an add/add conflict and GitHub answers 405 "merge conflicts". Wait for the author's rebase; never rebase a branch you do not own.
- **REST merge with a head guard**: `gh api -X PUT repos/O/R/pulls/N/merge -f merge_method=squash -f sha=<head>` refuses if the author pushed between your gate and the merge. Use it on every merge.
- **Local gate script gates the merged tree**: fetch, `checkout -B`, `git merge --no-edit origin/main` (local only, never pushed; a conflict aborts the gate), `pnpm install --frozen-lockfile` only if the lockfile changed, then typecheck / lint / test and print the three exit codes. ~15 s. Gate on exit codes, never on `tail`. CI checks the PR's merge ref at trigger time, so a PR that was green before a sibling merged can still break `main` (#262).
- **Close/reopen does not reliably re-trigger CI** on the current merge ref (it did nothing for #243). Ask the author to merge `main` and push; that always runs a fresh workflow.
- **Latest check-run per name**: after a re-run the check-runs list carries both the old red and the new green; sort by `started_at` and take one per name before judging.
- **Check-runs can be empty** for a head pushed during an outage (#171 had only a queued third-party suite). Ask for a new push rather than merging on a green local gate.
- The harness prints a "GitHub API rate limit exceeded" reminder whenever that phrase appears in a tool result, including inside a diff of `CLAUDE.md`. Check `gh api rate_limit` before believing it.
- All agents share one GitHub account: `gh pr review --approve` fails; reviews are comments with a `**Verdict:**` line. `gh pr merge --delete-branch` also deletes the local branch. `gh pr checkout` and `git cherry-pick` have no `-q`.
- `chore(handoff)` PRs sometimes carry tooling (#188 shipped `tools/producer/*.py`). Read the file list before fast-tracking.
- `import("playwright")` does not resolve under pnpm; use `@playwright/test`. Headless Chromium needs `--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader`.
- pnpm 11's minimum-release-age gate rewrites `pnpm-workspace.yaml` on `pnpm add`; commit it.
- The 5,000/hr API limit is shared by every agent; GraphQL runs out first. REST paths that keep the loop running: `pulls?state=open`, `pulls/N/files`, `pulls/N` with the diff Accept header, `commits/SHA/check-runs`, `issues/N/comments`, `pulls/N/merge`, `git/refs/heads/BRANCH`; check out with `git fetch origin BRANCH && git checkout -B BRANCH origin/BRANCH`.
- The Pages site is public to anyone with the URL although the repo is private.
