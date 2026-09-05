# Handoff: Tech Lead

Last updated: 2026-09-05 ~20:40 UTC (session 5; #748, #770 and #782 closed, queue empty, production held for the ED's playtest; see §0). Read `docs/process/roles/tech-lead.md` first; the complexity rubric is in it since #189.

## 0. READ THIS FIRST — production is paused; only #748 is live

**How you wait is why session 4 was retired.** It re-sent its full context on a
4-minute cron (223 runs at ~2.7M tokens each). **No cron, no scheduled prompt,
no timer.** Arm ONE persistent `Monitor` running a shell loop that polls
`gh api` every 5 minutes and prints only diffs (script shape in §5 "Monitor");
end the turn when nothing is left to do, and let its output wake you. Compact
past ~150k context. `studio.md` §3 carries the rule since #767.

**Production is paused** by Executive Director order (#748, 2026-09-04 17:48
UTC), restarted **on #748 only**: you, MapGen and eng-3. The other five roles
stay paused. **Merge nothing unrelated to #748 except handoffs and process
docs.** #757 (mech bay preview) is open, unreviewed, parked, and stays parked.
Do not decompose M3.

**Strict model tiers are in force** (#763): eng-3 is Fable and takes
`complexity:high` ONLY; eng-4/eng-5 are Opus and take low/medium ONLY; high
work queues behind eng-3 and never drops to Opus; MapGen works `area:mapgen`
only. Label every engineer issue `complexity:*` before it can be seated.

### The #748 split — all three children closed (07:30 UTC)

Campaign seed 4242's first mission, temperate city small, map seed **730982385**.
**#748 itself stays open for the Executive Director to close after playtest.**
Production is held to that playtest; after #776 merges there is nothing else.

| child | what shipped | where |
| --- | --- | --- |
| **#761** fog deleted unexplored terrain | **#771** `7dbac2c`. Three rungs, one `tintFor`: visible full, explored × 0.40 cold, unexplored × 0.28 colder; `ZERO_SCALE` gone; connectors own a material and take the ladder; `pickTile` rejects unexplored ground explicitly, tested both ways. Director accepted the renders. | `docs/design/tactical-fog-of-war*.png` |
| **#762** data or drawing? | Generator data correct for all three faults (MapGen's bisect, verified). Grass-a-floor-up fixed in **#769** `8704a2d`: no raised feature within one column of any lot; `golden-city` re-pinned; d1–d4 unchanged. **On record for the ED:** city/medium mech high-ground share 0.192 → 0.153, below #444's 0.20–0.35 band; grass-only margin is the unbuilt alternative. | `docs/design/shots/762-*.png` |
| **#766** brick flanks, placeholder stairs | Both premises were wrong and eng-3 measured them down. **#775** `4427cd5`: stairs always had a model, it faced +Z regardless of connector with the placeholder plank drawn through it; now turned by `stairsTurns`, plank retired. **#777** `c63b1a5`: the half wall is 0.5 tall on the deck; the fault was material — `wallFamilyForWall("half", undefined)` → concrete, `HALF_WALL_MODELS` per family, new `building.wall-half-concrete` with its kit script. #775's squash closed #766 early through the PR link; I reopened it, and #777's `Closes` closed it for good. | `docs/design/shots/766-*.png` |

**#748 is closed** (Director, 07:33) and **v0.2.4 tagged** for the Executive
Director's playtest. **But QA found (07:48, on #748 and in `qa.md`) that the
tilted slabs in the ED's frame were RAMP placeholder planks, not stairs**: #775
retired planks for `stairs` only; ramps (24–52 per city map, all outdoors) have
no model and `buildConnectors` still draws a 1.2 × 0.6 plank that floats clear
of both tile tops. The stairs #775 fixed are all indoors. I confirmed it against
the ED's screenshot and recommended on #748 a fourth child: a surface-matched
wedge built from the two connector tiles' `tileTop` planes, full tile width,
plank retired as for stairs, `complexity:medium` by the rubric (which lands on
the paused Opus seats — the Director must rule on the exception). **No ruling
yet.** Nothing merges on it until there is one.

**#776 (Art Director, #770) merged at `e228fdf`, #770 closed.** Very slight
mist over never-explored terrain, ground and walls/props/connectors alike;
Director accepted the look (over my measured objection that remembered and
never-explored grass share a tint at 2× — recorded, not held);
`UNEXPLORED_FOG_STRENGTH` in `graphics/data/unexplored-fog.ts` is the ED's
one-line retune. Its frames are of current `main` (concrete parapet included).
**#783 (Art Director, #782) merged at `7f333c8`, #782 closed** — the Director's
step 2 from #766: a dedicated viaduct parapet (concrete kerb, open two-rail
guard) with its kit script, reached only through a new `road` placement family
that buildings cannot hash into. It also added
`e2e/viaduct-parapet-screenshot.spec.ts`, a `CAPTURE=1` capture of the no-fog
`?models=1` control for seed 730982385 — use it as the standard control for
every graphics PR (#728). The ramp plank is still the last stray polygon on a
raised-road edge (see above).

**The queue is empty except parked #757.** Nothing merges until the ED's
playtest verdict or a Director ruling on the ramp child above.

**Follow-ups on record, not filed while paused:** the ramp wedge above; a
proper viaduct parapet / guard-rail model replacing the recoloured half wall
(Art Director, `area:art`, after #770); the design question whether a move may
be ordered into fog; #728 (fog captures go stale with every map change).

### How to run the loop now

Every wake: **sweep open `p0` issues first**, then PRs. Gate every PR on the
**merge result** with `gate.sh` (§5): typecheck, eslint, prettier, vitest,
build, **`pnpm test:sim`**, `CI=1 pnpm test:e2e`, each exit code in its own
variable; then REST merge with the head-sha guard and delete the branch. For
anything the player sees: download the committed renders, look at them before
the diff, and for #748 also `CAPTURE=1` on the merged tree.

## 1. Where things stand

### Session 4, third stretch (13:10–17:30 UTC): 57 commits, and one red `main` I caused

The queue emptied and refilled roughly ten times. Everything merged is gated on the
**merge result**, not the branch — I check out `main`, merge the PR into it locally,
and run the gate against that. That is the only place a merge-order interaction is
visible, and it is why the mechanism matters more than any single review below.

**`main` went red once, on `sim · mission sweep`, and it was mine.** #699 added a
walkover assertion; #703 (branched earlier) changed desert prop clustering; neither
PR's own CI ever saw the combination, because #703's branch predated the assertion.
A difficulty-4 seed went from won to **lost at turn 47**. I bisected it —
`ab7b3f2` green, `cf2af0c` red — and raised the cap to 60 turns first to rule out a
cap artifact before concluding, then reverted in #723.

The root cause was that **my own gate script did not run `pnpm test:sim`**, even
after I added the CI job for it in #686. So I was testing the merge result with the
one check that would have caught it switched off. Fixed. I also publicly retracted a
promise to add branch protection: with nine agents merging every few minutes it would
serialise everyone to guard against something the gate should catch.

### The infrastructure that changed

- **`sim · mission sweep` is a CI job** (#686). 60 seeded missions played through the
  real rules, per-turn invariants, and a floor on how many resolve. Before it, #668's
  suite ran only when someone remembered — and a false assertion in it merged green
  and stood until #692. ~2 min on a parallel runner.
- **Two separate causes of a red that is not the author's** were fixed: `expect.timeout`
  was never set, so every assertion ran on a 5 s budget while the runner is 4–5× slower
  (#691); and Playwright asked for 16 workers on a 32-core box nine agents share, measured
  at load average 63 and later 102 (#700, capped to 4 locally, ~3 s cost). Three authors
  had each investigated a red that was not theirs before these landed.
- **Schema is at v14** — v13 `ADD_COMMAND_SEQ` (#682), v14 `ADD_VISION_LAST_SEEN` (#722).
- **ADR 0006 carries `lastSeen`** (#732), with the constraint that it is written only
  from currently-spotted units. That rule had been living in a PR comment.

### Decisions I made, and one I got wrong

**#666 closed into #497**, which is now `p1 / complexity:high`. #666 claimed there was
no defeat condition; #692 disproved it — every difficulty-10 seed concludes as a *loss*
between turns 37 and 56. What survives is pacing, which is #497's scope. I had reported
the wrong version upward and corrected it.

**#695 was my error and is retracted.** I read GDD §6.4's "stealthy flanker", saw a
term that could not change a destination, and directed that the lurker's
`exposureWeight` be raised. #702 measured that **no such weight exists** — it is a
cliff, and every value that changes the route ends the engagement. A bug that cannot
see its mark has no mark. #722 built the memory half and the cliff did not move,
because #685 measured 0% of contact tiles ever unseen. Both halves are in ADR 0006 now.

I reasoned from a document to a number without checking whether the geometry could
express it, and stated it as a decision rather than a hypothesis.

**#741: I ruled against the tidier fix.** Every deploy tile is also an extraction tile,
384 of 384 across 24 maps — because **no pass ever sets `draft.hooks.extraction`**; it
only ever comes from a fallback copying the first deploy zone. Collapsing the markers
would have built a workaround around a missing generator step. Filed as #743.

### The pattern worth carrying

Eleven defects this session were one shape: **an instrument reporting a result it never
measured.** A CSS rule that lost the cascade and so never applied (#683); a manifest
entry that meant *registered*, not *drawn* (#698, seven sprites dark); a conditional
assertion that opts out when nobody is watching (#709); an inert `gh api` guard that let
#108 be built twice and caused today's two duplicate seatings (#720); a capture that
regenerated nothing while passing (#650); `data-units` that meant *the render succeeded*
with no way to say it had not (#688); and my own gate, twice. **Every one read correctly
and none of them ran.**

The counter-discipline that keeps working: **predict a number, then measure it.** #677
found a real defect only because 764 blocked lines contradicted a prediction of 175 —
23 existing tests and 4 new ones all passed with the bug in place.

### Work was seated twice, twice

#652's shortcut half (#664/#684) and the difficulty curve (#699/#708). The second cost
a **wrong conclusion**: 6 seeds per difficulty produced "d10 is no harder than d5", which
120 seeds contradicted. Cause was mechanical — the autofill loop's "is someone already on
this?" check had never run (#720). The half still open is upstream: an issue with
separable halves gets taken twice because the halves are not separately claimable.

### Session 4, second half (10:15–13:10 UTC): M2.5 finished, v0.2.3 gated on one bug

**M2.5 is down to the epic itself and #457.** Every band-1 to band-4 item is merged. `v0.2.3` was held on **#624** — the Director judged the fog frame and found the board buried under overlay marks — and released when **#627** closed.

**The overlay story is the one to read if you read one thing.** Four planes all spoke the same visual language, so nothing said which *question* a mark answered, and the line-of-sight cue marked **93 of 93** reachable tiles. An indicator true everywhere carries no information. #631 gave the planes a language (shape carries the question, colour only urgency), #635 made weapon range a boundary, #636 turned cover from a centred ring into a tick per covered side — which is *more* information in fewer marks, because the rules always computed all four sides and the overlay collapsed them to a maximum.

**I got that diagnosis wrong twice in public** before the Art Director measured it. I said the rings were not the range envelope, withdrew that after misreading `weaponRangeFrom`, then said they were the cover markers. My own byte-identical test — changing the envelope altered the frame not at all — should have told me to count every layer rather than guess the next one.

**Fog of war is complete**: state and migration (#554), the AI deciding from a branded `MissionView` it cannot bypass (#560), overwatch not reacting to what it cannot see (#564), the renderer drawing the player view (#570), blind bugs advancing on the landing zone (#589), and the HUD no longer listing unseen enemies (#619).

**Schema is at v12.** v11 `ADD_MISSION_VISION` (#554) and v12 `SPLIT_WEAPONS_PER_UNIT` (#629). Both have shipped in a tag, so both are frozen.

**A pattern worth carrying forward.** Three defects this session had the same root cause: code trusting a signal that meant something subtly different from what it looked like — `data-screen` meaning *mounted* rather than *measurable* (#473), a missing tile meaning *air* rather than *rock* (#593), and `PCFSoftShadowMap` naming a filter three silently swaps (#507). All three passed their tests, because each test asked the same wrong question the code did. That sits alongside the *green suite is not a working screen* rule now in `studio.md` §3.

### Session 4, first half (05:00–10:15 UTC): the v0.2.0 push, then M2.5

**v0.2.0 tagged at 07:00, v0.2.1 after it.** The Director ran a release push and then relaxed it — *"cut whatever is genuinely ready, do not sacrifice quality"* — which was the right call and is worth repeating next time: nothing was rubber-stamped to make the tag.

Roughly 60 PRs merged. The ones that changed the shape of the game:

| Area | What landed |
|---|---|
| Playable loop | #453 deploy → tactical → results; #496 the HUD walks a real path (a one-tile-per-click bug made missions look unwinnable); #543 move is the default action; #549 right click invokes, digits arm |
| Fog of war | #554 state + v11 migration, #560 the AI decides from a branded `MissionView`, #564 overwatch cannot react to what it cannot see, #570 the renderer draws the player view, #589 blind bugs advance on the landing zone |
| Tactical feel | #540 phase banners, #542/#546 combat feedback, #558 event log, #545/#577/#582 movement bands, #548 range indicator, #555 overlays lifted clear of the ground, #556 camera opens on the force, #574 glyphs, #581 building ghosting |
| Art | #505 the map draws real models, #442 env atlas, #503 bug crests, #467 icon set, #588 mech-bay thumbnails |
| Map | #547 spawners placed where something can shoot them, #535 outdoor high ground, #443 edge-spawn bands, #470 hook distance fitted to the map |

**M2 epics #317, #318 and #319 are closed** (all sixteen children closed, QA verified `v0.2.1` as a production artifact). #320 is left; #343 and #344 look satisfied in substance and want a decision rather than scheduling. M2.5 bands 1 and 2 are done, band 3 has started.

**Two ADRs, and one of them is not signed off.** ADR 0006 (fog of war) and ADR 0007 (in-world UI) shipped in #534, both marked **Proposed**. 0006 changes architecture §2 — save format and the AI interface — and `GAME_STATE_SCHEMA_VERSION` is now **11** on `main`. It was cheap to amend while it was a document; it freezes once a tag ships with it. **Ask the Director for §2 sign-off.**

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

Session 4:

- Nothing of mine is open. #581 (building ghosting, #526) merged after the Art Director's §12.4 settled the technique.
- **Filed and still open:** #450 (redraw the Earth map as a true plate carrée — the nudges in #449 are a patch over an inaccurate drawing), #473 (`data-map-ready`, so specs stop racing the map viewport), #484 (spawners drawn but indoors), #578 (a flaky e2e passes on retry and the gate reads green).
- **#517 is the one to watch**: nothing on screen says which tiles have a line to an objective, so a player walks up, finds Fire greyed out and concludes it is broken. QA did exactly that twice and withdrew two wrong bug reports because of it.

Earlier:

- #336 `tuning: squad combat ratings vs auto-resolve difficulty scale` (complexity:low, after #84) filed from an observation on #315. #307 shipped in #346 (Director chose the persistent offset; v4 → v5 `ADD_THREAT_OFFSET`).
- #197 (filed from #167) closed the same session via #198. #246 `refactor(overworld): derive the command and event unions from augmentable maps` (complexity:medium) is mine: four PRs in one hour needed a second merge of `main` purely for the union line; module augmentation removes the shared line.
- Earlier follow-ups still open: #108 (promote `Registry` to `core/`, sequence after the mapgen stack), #141 (UPPER_SNAKE tuning exports).
- Nothing else of mine is open.

## 3. Decisions I made and why

Session 4, 2026-09-04:

- **Merge order is a hazard I create.** Six PRs this session needed a conflict resolved or a one-line fix purely because I merged a sibling minutes earlier — #483, #549, #629, #633, #623, #642. Resolving them myself and saying so is faster than a round trip, but check the base and re-gate the author's newer head rather than merging what you reviewed.
- **A flake makes a gate lie, and my own gate lied twice.** It piped playwright to `tail`, so `$?` was tail's exit code; then it called `playwright` directly, missing the `--fail-on-flaky-tests` that lives on the npm script. Run `CI=1 npx pnpm test:e2e` into a file and read the exit code.
- **Do not review with uncommitted work in the tree.** I nearly filed a false failure against #494 because my own #624 branch rode along into someone else's gate.
- **Fog of war is per-side knowledge, and the AI gets a filtered view rather than a predicate** (ADR 0006 §2.3). A `canSee()` helper is advisory: a behaviour that forgets to call it still compiles and still cheats. #560 went further than I specified with a phantom-branded `MissionView`, so a raw `TacticalState` will not compile where a view is required. That is the shape to defend.
- **In-world UI is DOM anchored to projected world points** (ADR 0007), not three.js geometry. `ui/` holds no three, the world→screen bridge already lives in `ui/controller`, and the Executive Director's objection was to panels that *sit at the side and read like a spreadsheet* — placement and presentation, not technology. The ADR turns that into five acceptance criteria.
- **Render every visual change before believing it.** This session that caught: an `alphaMap` written to the alpha channel when three samples green; a region wash buried inside the map slab; overlays drawn below the ground since #474; and buildings turning see-through when ghosted materials stopped writing depth. Every one passed its unit tests first.
- **Measure before diagnosing, and say which it is.** I twice told #535's author the cause was "likely the elevation pass raising ground a route ran through" before proving it. The guess pointed the right way, but the level-by-level passability counts are what settled it, and I should have led with them.
- **A retraction can be as wrong as the claim.** On #545 I said the two AP bands read too similarly, then withdrew it when #555 revealed the overlays were invisible. Once they rendered, the bands genuinely did not read (#577 fixed it). Finding *an* explanation is not finding *the* explanation.

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

0. **At retirement (2026-09-05 ~05:55 UTC):** see §0. Live: #761 (eng-3, building),
   #766 (eng-3, queued), #762's adjacency PR (MapGen, pending). Nothing else may
   merge except handoffs. `main` is `b695b0b`, green on all seven checks.
   #497 remains the p1 once the pause lifts; #743 (nothing places the extraction
   hook) must be coordinated with it, not landed under it. #578 is two-thirds
   explained (#691, #700) and stays open until sightings stop.
1. **ADRs 0006 and 0007 are Accepted as of this update.** Both sat at *Proposed* while
   every part of them shipped — fog of war across six PRs and four schema versions, the
   radial and context menus in `v0.2.3`. An ADR that describes load-bearing architecture
   while claiming to be under consideration is worse than no ADR: it invites someone to
   relitigate a decision the code has already made. Check the status line of anything you
   author against what has actually landed.
1. Review loop every ~5 minutes (session 3 runs it as a cron job in the session; a tick is one `pulls?state=open` call, one `issues?state=open` sweep, then per-PR files/diff/check-runs); label any new unlabeled engineer issue first. MapGen's self-filed issues (#352, #354) went unlabelled on purpose: the specialist works them, the Producer never routes them.
2. **Schema is at v14** (v11 `ADD_MISSION_VISION`, v12 `SPLIT_WEAPONS_PER_UNIT`, v13 `ADD_COMMAND_SEQ` #682, v14 `ADD_VISION_LAST_SEEN` #722). Two PRs took the same version number within twenty minutes once; the one that merges second renumbers and the chain test catches it. Check `GAME_STATE_SCHEMA_VERSION` before approving any save reshape, and remember migrations freeze once a tag ships them.
3. M1 is done and tagged. M2 order on eng-3 (updated 17:52: #323–#327 merged): #372 (#323) → #324 commands (hold to the ruling above: campaign dispatcher, `no-active-mission` error, one store) → #325 → #326 → #328 → #330 → #341. #324 must narrow `TacticalState.log` to the tactical event union and pass the dispatcher's `ctx.ids` into `startTacticalMission`. Medium seats: #338/#339/#342 as their inputs land, QA bugs (#219, #218, #291, #294, #304, #368), #369, #230.
3. M2 reviews: #321/#322 (models, data) will come first; then #323 (insist on the v4 → v5 migration and on `activeMission` being plain data); then #324 against the ruling above. `tactical/` must not import `graphics/`, `ui/` or `app/` (ESLint enforces it) and must not read `Math.random()` or `Date`.
4. Composition-root churn continues to be the one hot spot (`app/service/game-composition.ts`, `app-bootstrap.ts`, `ui/model/screen.ts`, `screens.css`): tell the next author to merge `main` right before pushing; merge whatever is ready without waiting for siblings.
5. #336 tuning after #84; #307 after the Director's decision.
6. Add a vendor chunk for three.js in `vite.config.ts` when someone touches it; the 500 kB warning is noise.

## 5. Gotchas

- **Your gate must run every job CI runs.** I added `sim · mission sweep` to CI in #686
  and did not add `pnpm test:sim` to the gate script, so for four hours I was testing
  merge results with the one check that would have caught #703 switched off. `main` went
  red. A gate missing a check reads exactly like a passing gate.
- **CI tests the branch, not the merge result.** A PR whose branch predates an assertion
  another PR added will be green on a tree where that assertion does not exist. #703 was
  green on its own head and red on `main` the moment it landed. Gating the local merge is
  the only thing that sees it — do not trust a green PR as evidence about `main`.
- **`unresolved` in the mission sweep means "the cap arrived", not "the mission hung".**
  #668 pinned `lost 0` from a 15-turn cap and stated it as a property of the rules; at 150
  turns every hard seed loses. Before concluding anything from an unresolved seed, raise
  `SIM_TURN_CAP` (#711) and look again.
- **Emphasis is an assertion and nothing type-checks it.** Two defects this session were
  styling making a claim the content did not support: a danger border announcing a loss
  that had not happened (#736), an accent recommending a choice the game does not default
  to (#742). Derive emphasis from the same source as the thing it claims about.
- **`pnpm lint` is `eslint . && prettier --check .`.** Running `eslint` alone passes a branch that CI then fails on formatting. Two of my own PRs came back red for exactly that. The session-4 gate script runs typecheck, eslint, prettier, vitest, build and playwright, each into its own exit-code variable.
- **Check the PR's base before merging, and verify the content afterwards.** #542 was stacked on another branch; I merged it without looking, so its content went into that branch rather than `main`, and GitHub then retargeted the closed PR to `main` so it read `base=main, merged=true`. Verify with `git ls-tree origin/main <path> | wc -l` — `ls-tree` exits 0 for a missing path, so testing the exit code proves nothing.
- **A flaky spec makes a gate lie.** Playwright retries, so a spec that fails then passes exits 0 while the summary count silently drops. Compare the pass count between runs; #578 tracks the instance that keeps appearing.
- **Do not `pkill -f` a pattern that appears in your own command line.** It matches the shell running it and kills the session. Twice this session. Find the process by port instead.
- **Gate script** (`gate.sh BRANCH`, rebuilt each session in the scratchpad): refuse a dirty tree, `git fetch origin BRANCH main`, `checkout -B`, `git merge --no-edit origin/main` (abort on conflict), install only if the lockfile differs from `main`, then typecheck / eslint / prettier / vitest / build / `test:sim` / `CI=1 test:e2e` each to a log file with its own exit code, and print all seven. ~4 min. Return to `main` afterwards; the script leaves the tree on the merged branch.
- **Monitor** (session 5): one persistent `Monitor` running a `while true; sleep 300` loop that writes four sorted snapshots — `pulls?state=open` as `#N title head=sha7`, one `commits/SHA/check-runs` line per open head (latest run per name; pass the sha into jq via an env var and `$ENV`, `gh api` has no `--arg`), `issues?labels=p0`, and the newest issues whose body lacks `TUT agent` (all issues share one account, so the Executive Director is "no agent header") — and prints only `diff` lines against the previous snapshot. Silence from a section means nothing changed **only if that section is proven to work**: my first version's CI query was a jq error swallowed by `2>/dev/null` and printed nothing for ten minutes. Check the state files once after arming.
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
