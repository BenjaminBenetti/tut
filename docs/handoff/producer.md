# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-04 08:00 UTC (seats via REST; board fields lag, GraphQL quota exhausted until 09:00))

| Milestone | done / total |
|---|---|
| M0 Foundation | 12 / 13 |
| M1 Overworld | 64 / 64 |
| M1.5 Map Generation | 33 / 34 |

Board: Backlog 7 · Ready 32 · In Progress 2 · In Review 10 · Blocked 0 · Done 187

**Engineer seats** (one open issue per seat; Producer assigns via `seat:eng-N`; route by `complexity:*` — high → default-effort seats only, low → medium-effort seats first):

| Seat | Effort | Current | Status | Last merged |
|---|---|---|---|---|
| eng-3 | high | #519 tactical: move is the default action — click a reachable tile to move | Ready | #488 |
| eng-4 | low | #521 tactical: paint the 1 AP and 2 AP movement range differently | Ready | #426 |
| eng-5 | low | #343 qa: headless tactical simulation across seeds | Ready | #474 |

⚠ unassigned Ready: #108 (low), #141 (low), #424 (low), #457 (no complexity label), #446 (no complexity label), #447 (no complexity label), #468 (low), #473 (low), #477 (no complexity label), #480 (low), #487 (low), #495 (no complexity label), #507 (no complexity label), #511 (no complexity label), #517 (no complexity label), #519 (low), #521 (medium), #522 (low), #523 (low), #524 (medium), #525 (low), #526 (high), #527 (low), #530 (low), #532 (high), #533 (low) · need Tech Lead complexity label before assignment: #457, #446, #447, #477, #495, #507, #511, #517

**Ready now** (no unmerged dependencies):

- #108 (engineer) refactor(core): promote generic id Registry to core/ and reuse in mapgen and roster
- #141 (engineer) refactor: rename scalar tuning exports to UPPER_SNAKE_CASE (economy-tuning, threat-tuning)
- #190 (art-director) infra(art): headless Blender + OpenSCAD + trimesh/cadquery toolchain in the devcontainer, with proof render and art-blender skill
- #343 (qa) qa: headless tactical simulation across seeds
- #344 (qa) qa: Playwright tactical smoke
- #424 (engineer) refactor(graphics): rename the Isometric* camera rig now that it carries two projections
- #457 (engineer) Tactical VFX playback: tracer between shooter and target, claw slash for melee, burst on bug death
- #446 (engineer) tactical: melee bugs cannot be blocked by cover, and cover hands them a flank bonus
- #447 (engineer) mapgen: M3 archetypes — hive and spore crash site, design sketch
- #450 (art-director) Art: redraw the Earth map as a true equirectangular projection
- #468 (engineer) ui: leaving a mission through the HUD strands it — no way back to the tactical screen
- #473 (engineer) overworld: signal when the map is measurable, not just when the screen is shown
- #477 (engineer) Overlapping hook markers z-fight: a tile that is both deploy and extraction shows whichever batch happens to draw last
- #480 (engineer) bug(ui): debrief says "No casualties" and "No damage taken" on a mission that wiped the whole force
- #487 (engineer) bug: a deployment over 16 units cannot launch — nothing caps it and the deploy zone is 16 tiles
- #495 (engineer) No screen uses any icon or thumbnail: 42 icons and 30 unit thumbnails are registered with zero consumers
- #507 (engineer) Nothing casts a shadow, so the city reads as art placed on a plane rather than a place
- #508 (mapgen) mapgen: no WallKind can express a half wall, so building.wall-half is orphaned art
- #511 (engineer) graphics: pick a wall family per building, so a block stops reading as one extruded material
- #512 (mapgen) mapgen: city maps give mechs reachable outdoor high ground
- #517 (engineer) Tactical screen gives no cue where a unit can shoot an objective from
- #519 (engineer) tactical: move is the default action — click a reachable tile to move
- #521 (engineer) tactical: paint the 1 AP and 2 AP movement range differently
- #522 (engineer) tactical: weapon range indicator on the selected unit
- #523 (engineer) tactical: unmistakable turn banners for TDF and bug phases
- #524 (engineer) tactical: floating combat text that renders above units, never inside them
- #525 (engineer) tactical: collapsible event log in the bottom left
- #526 (engineer) tactical: XCOM-style building ghosting around obscured units
- #527 (engineer) docs(adr): approach for in-world tactical UI (radial menus, context menus)
- #530 (engineer) docs(adr): fog of war and the tactical vision model
- #532 (engineer) tactical: one attack option per weapon
- #533 (engineer) tactical: infantry squads get two attacks per turn

**In-flight PRs** (age h / idle h / review):

- #534 0.0h / 0.0h / n/a — docs(adr): fog of war and in-world UI decisions for M2.5 (#514)
- #518 0.1h / 0.1h / n/a — docs(gdd): fog of war, per-weapon attacks, squads attack twice, combat presentation (#514)
- #516 0.1h / 0.0h / n/a — chore(handoff): qa — a mech destroys an indoor spawner, a lone squad cannot
- #515 0.1h / 0.1h / n/a — feat(tactical): draw egg spawners in the scene so they can be seen and clicked (#484)
- #513 0.1h / 0.1h / n/a — test(tactical): drive units to a firing position, not onto the tile (#494)
- #510 0.3h / 0.2h / n/a — feat(art): the Blender model track — building kit, props, scenery and three wall families (#454, #463, #490, #509)
- #472 2.2h / 2.2h / n/a — docs(art): tactical scene presentation spec and mission mood concept (#471)
- #452 2.6h / 1.1h / n/a — chore(handoff): qa 2026-09-04 (#439 evidence and regression spec)
- #442 2.8h / 1.5h / n/a — feat(art): env atlas round 2 — ground, roof and concrete read as surfaces (#441)
- #436 2.9h / 1.2h / n/a — feat(art): tracer, claw slash and bug death VFX sprites + sheets (#429)
- #435 2.9h / 1.1h / n/a — chore(handoff): qa 2026-09-04 (runs 64–68, straight-down map, picking check)

**In progress** (branch pushed?):

- #502 yes — Art: bugs read as dark blobs on dark ground — the chitin silhouette has no edge at 64 px

**Blocked**:

- none

**Next assignments for idle engineers** (Ready first, then what unblocks next):

1. #108 — refactor(core): promote generic id Registry to core/ and reuse in mapgen and roster
2. #141 — refactor: rename scalar tuning exports to UPPER_SNAKE_CASE (economy-tuning, threat-tuning)
3. #424 — refactor(graphics): rename the Isometric* camera rig now that it carries two projections
4. #457 — Tactical VFX playback: tracer between shooter and target, claw slash for melee, burst on bug death
5. #446 — tactical: melee bugs cannot be blocked by cover, and cover hands them a flank bonus
6. #447 — mapgen: M3 archetypes — hive and spore crash site, design sketch
7. #468 — ui: leaving a mission through the HUD strands it — no way back to the tactical screen
8. #473 — overworld: signal when the map is measurable, not just when the screen is shown
9. #477 — Overlapping hook markers z-fight: a tile that is both deploy and extraction shows whichever batch happens to draw last
10. #480 — bug(ui): debrief says "No casualties" and "No damage taken" on a mission that wiped the whole force
11. #487 — bug: a deployment over 16 units cannot launch — nothing caps it and the deploy zone is 16 tiles
12. #495 — No screen uses any icon or thumbnail: 42 icons and 30 unit thumbnails are registered with zero consumers
13. #507 — Nothing casts a shadow, so the city reads as art placed on a plane rather than a place
14. #511 — graphics: pick a wall family per building, so a block stops reading as one extruded material
15. #517 — Tactical screen gives no cue where a unit can shoot an objective from
16. #519 — tactical: move is the default action — click a reachable tile to move
17. #521 — tactical: paint the 1 AP and 2 AP movement range differently
18. #522 — tactical: weapon range indicator on the selected unit
19. #523 — tactical: unmistakable turn banners for TDF and bug phases
20. #524 — tactical: floating combat text that renders above units, never inside them
21. #525 — tactical: collapsible event log in the bottom left
22. #526 — tactical: XCOM-style building ghosting around obscured units
23. #527 — docs(adr): approach for in-world tactical UI (radial menus, context menus)
24. #530 — docs(adr): fog of war and the tactical vision model
25. #532 — tactical: one attack option per weapon
26. #533 — tactical: infantry squads get two attacks per turn
<!-- digest:end -->

**Status: PRODUCTION RESUMED** (Director, 2026-09-03 03:05 UTC). Pool: eng-3 (default effort, takes `complexity:high` and anything), eng-4 and eng-5 (medium effort, `complexity:low|medium` only). eng-1, eng-2, eng-6 are gone; their seat labels are inactive.

**Gap audit (03:10 UTC, posted on #35):** closed. Every stopped-seat issue is Done or reseated (#52 → eng-5, #55 → eng-3); #60 and #162 merged.

**v0.1.0 RELEASED — 2026-09-03 13:22 UTC** (Tech Lead): tagged at the #336 squash, Release zip and GitHub Pages deploy succeeded, https://benjaminbenetti.github.io/tut/ serves it. M1 Overworld closed 64/64 (epics #35–#42). QA verified #217's fix post-release; remaining QA bugs #218 #219 #291 #294 #304 #368 are post-release polish.

**v0.2.0 shipped; the milestone that matters now is M2.5 Tactical Feel.** The Executive Director playtested v0.2.0 and gave a full round of feedback; the Director filed it verbatim as epic **#514** with four priority bands and I decomposed it into sixteen issues under milestone **M2.5** (number 10). Band position rides on the priority label — **band 1 = p0, band 2 = p1, band 3 = p2, band 4 = p3** — so the occupancy loop orders them without intervention, and band 1 outranks the M2 remainder.

- **Band 1 (p0):** #519 move by default · #520 right-click invokes + number keys (blocked by #519, same controller) · #521 two-tier AP range · #522 weapon range indicator · #523 turn banners
- **Band 2 (p1):** #457 VFX playback · #524 floating combat text · #525 event log · #526 building ghosting
- **Band 3 (p2):** #527 ADR (done, PR #534) · #528 radial menu · #529 context menu *(blocked by #528 — they share one `world-anchored-layer`; building both in parallel gives two radial menus)*
- **Band 4 (p3):** #530 ADR (done) · #531 fog of war *(must land after any bug-behaviour work in flight — it changes `BugBehaviour.choose`)* · #532 per-weapon actions · #533 squads attack twice

**Band 2 is the Art Director's**, and their diagnosis is the single most useful finding of the session: every muzzle flash, impact and damage number is placed at `feet + 0.6 u` regardless of unit height, so on a 2.79 u mech the number draws at ankle height *behind* the model. Nothing was missing; it was drawn inside the units. One bug explains all three of the Executive Director's sentences about feedback. #457 and #524 are on `.producer/hold.txt` so no seat duplicates that work; #525 and #526 stay seatable and I asked whether they want those too.

**The win path is proven** (QA, #516): a mech destroys an indoor egg spawner in one shot; a lone infantry squad can hit one but cannot finish it. Both earlier "zero shots fired" findings were faults in QA's own driver — targeting by tile when the HUD resolves by id, and walking to the nearest reachable tile rather than one with line of sight. That second fact is measured support for #533.

**Open recommendation to the Director:** move **#533 (squads get two attacks)** out of band 4. It is an action-budget change plus a doc edit, it answers a complaint he made in plain words, and QA has now measured it — by the Director's own band 1 rule it is cheap and high value, yet it currently lands last. Also flagged: **#526 ghosting** is far more expensive than its band 2 neighbours and will likely trail them.

**Seat plan:** eng-3 #519, eng-4 #521, eng-5 #343. Next by priority: the rest of band 1 (#522, #523, then #520 once #519 lands), then M2 leftovers #468, #497, #480, #487.

**Risks / asks** (08:00 UTC):

- **The shared GitHub GraphQL quota is exhausted again** (resets 09:00). `gh api rate_limit` reports headroom while real GraphQL calls fail, so do not trust that endpoint — try a call. REST is unaffected; `groom.py` reads via REST and only its project-field *writes* fail, so board Status/Owner lag while issues, labels and comments keep working.
- Eight issues are Ready but untiered and cannot be auto-seated (#446, #447, #477, #495, #507, #511, #517 and others). Not biting while seats are full.
- M2 sits at 42/50 and is no longer the priority; M2.5 outranks it for anything not in flight.

---


## Seat plan (next up per seat; refill immediately on merge, priority first, then same domain)

| Seat | Now | Then | Then |
|---|---|---|---|
| eng-1 | #52 deployable model (no branch yet) | #59 lose/win (Ready) | #58 spread → #65 → #66 |
| eng-2 | #60 stipend (PR #167) | #65 deployable commands (needs #52) | #66 effects → #68 AdvanceDay |
| eng-3 | #8 app bootstrap + router (PR #171) | #72 composition root (needs #55, #56) | #73 overworld screen |
| eng-4 | #56 save round trip (PR #166) | #108 core registry refactor | #49 validation → #63 → #64 |
| eng-5 | #162 Earth texture on overworld scene | #72 or #73 (whichever is open when it frees) | #75 city panel |
| eng-6 | #55 dispatcher (no branch yet) | #61 mission generation (Ready) | #62 auto-resolve → #67 launch |

Unassigned Ready fillers: #141 (tuning export rename, p3), #49, #58, #59, #61, #108. Rule of thumb when a seat frees: p0 gates first (#8, #55, #56, #72), then the seat's own domain, then the fillers. Every assignment gets a one-line `**Producer**` comment on the issue naming the tentative follow-on.

## Project board IDs (project 5, owner BenjaminBenetti)

```
Project id  PVT_kwHOAVZkgc4BiL0w
Status      PVTSSF_lAHOAVZkgc4BiL0wzhhEyFA
  Backlog ae63e765 · Ready 5025a5a6 · In Progress 6a94ad75 · In Review c8fa47ad · Blocked 8d9f4db2 · Done 7db260b6
Owner       PVTSSF_lAHOAVZkgc4BiL0wzhhEyMA
  director 5e31d037 · producer 8a552d5d · tech-lead 705b43c0 · engineer d1c51bce · art-director 0e5b142d · mapgen aa2f1e75 · qa 5ce3489f
```

Example: `gh project item-edit --project-id PVT_kwHOAVZkgc4BiL0w --id <item> --field-id PVTSSF_lAHOAVZkgc4BiL0wzhhEyFA --single-select-option-id 5025a5a6` moves an item to Ready. Item ids come from `gh project item-list 5 --owner BenjaminBenetti --format json`.

## Epic map

| Epic | Milestone | Children |
|---|---|---|
| #35 World model, state root, commands | M1 | #43 #105 #54 #55 #56 |
| #36 Infestation, threat, end conditions | M1 | #50 #57 #58 #59 #68 |
| #37 Economy | M1 | #44 #53 #60 |
| #38 Roster | M1 | #45 #46 #48 #49 #63 #64 #69 |
| #39 Missions, events, auto-resolve | M1 | #106 #51 #61 #62 #67 #107 #70 #71 |
| #40 Deployables | M1 | #52 #65 #66 |
| #41 Overworld presentation | M1 | #47 #72 #73 #74 #75 #76 #77 #78 |
| #42 Roster / mech bay / deployment UI + e2e | M1 | #79 #80 #81 #82 #83 #84 |
| #32 Map generation (MapGen owns, closed) | M1.5 | #13 #17–#31 #33 #97 #85 |
| #316 Tactical runtime model + species | M2 | #321 #322 #323 #324 |
| #317 Tactical rules | M2 | #325 #326 #327 #328 #329 #330 |
| #318 Bug AI | M2 | #331 #332 #333 #334 #335 |
| #319 Tactical presentation | M2 | #337 #338 #339 #340 #341 |
| #320 Integration, sim QA, tuning | M2 | #342 #343 #344 #345 |
| M0 skeleton (Tech Lead owns, no epic) | M0 | #2–#11 |

Critical path for M1: #43 → #105 → #54 (needs #7, #11, #44, #45, #48) → #55 → #68 (AdvanceDay) → #72/#73 (screens) → #82/#83 → #84 e2e.

## How I work

- Grooming script: `tools/producer/groom.py` (`python3 tools/producer/groom.py [--dry]`), then `python3 tools/producer/render_handoff.py` to regenerate the digest between the `digest:start` / `digest:end` markers in this file. Everything outside the markers is hand-written; edit it directly. Tooling changes go in `chore(producer): …` PRs (Tech Lead's ask on #94); `chore(handoff)` PRs carry only this file. It reads every issue, PR and remote branch, then sets Status: closed → Done; open PR referencing the issue (`Closes #N`, `(#N)` in title, or branch `type/N-slug`) → In Review; remote branch `type/N-*` → In Progress; label `status:blocked` → Blocked; every `Blocked by #N` in the Dependencies section closed → Ready; else Backlog. Epics go In Progress once any child leaves Backlog/Ready and Done when all children close. Missing issues are added to the board with Owner inferred from labels (mapgen / art / qa / M0→tech-lead / epic→producer / else engineer).
- Dependencies are parsed from the `## Dependencies` section, so keep writing `Blocked by #N` there.
- Loop every ~15 min: `git pull`, run groom, **fill idle seats first** (digest flags them; pick the same-domain next from the seat plan), read new comments addressed to Producer, chase PRs idle > 3 h and In Progress issues with no branch > 3 h, regenerate this file's digest, push the handoff PR when the digest changed materially.

## Decisions made and why

1. **Did not create an M0 epic or M1.5 issues.** The Tech Lead had filed #5–#11 and MapGen had filed #13, #17–#33 (complete, well-formed, sequenced) while I was drafting. Duplicating would have split the truth. I added only #85, the mission → `MapRecipe` seam, and linked it under #32.
2. **`GameState` root belongs to #7 (save scaffolding), not to M1.** #54 extends it rather than defining a second root. #54, #55 and #47 are blocked on ADR 0003 (#11) so the command/event contract is decided once.
3. **Biome / settlement ids live in `src/content/model/`** (architecture §4) and are created by #43; MapGen's #19 keys its definitions on them. Names aligned to MapGen's `rural | town | city`. Comment left on #19.
4. **Four M1 issues Ready before the M0 skeleton is complete** (#43, #44, #45, #46): they are pure data models with tests and need only the merged tooling (#5). Everything that needs `core/` Result types, the router, save or the camera rig stays Backlog until those merge.
5. **Sizes**: every child is a half day to a day; #54, #49, #58, #61–#64, #67, #68, #72–#75, #79, #80, #82 are the full-day ones.
6. **Owner on child issues is the role expected to take it**, not a person. The Director spawns engineers against Ready.
7. **Split #43 into model (#43) and seed data (#105)** at 04:55 so the three issues that only need the types (#50, #51, #52) unblock within hours, not half a day. Carved the dependency-free content out of #51 (→ #106 mission types) and #70 (→ #107 event types) for the same reason.
8. **#47 (GameStore) marked Ready with #11 still open**: its real contract (`Command`, `Applied`, `Result`) merged in core #6; ADR 0003 documents those types. Judged the design question closed. If #11 lands with a different store shape, #47 adapts in review.
9. **MapGen split #29 → #29 + #97** on my size note; #85 now blocks on #97.
10. **Seat assignment (Director, 05:05 UTC, #117)**: I label exactly one Ready issue `seat:eng-N` per seat, refill on merge, same domain first, consult the Tech Lead when sequencing touches architecture. Assignment note posted on each issue. eng-6 pre-labelled (#107) so it starts the moment it is spawned.
11. **Closed #105** (Earth seed data): eng-1's PR #115 for #43 already ships 12 regions / 37 cities with derived symmetry and tests, so the split was moot. #54 no longer depends on it.
13. **Filed M2 (2026-09-03 09:48 UTC)** from the scratchpad draft when the Ready queue fell to low-tier fillers only; `m2_spec.py` + `m2_created.json` in the scratchpad hold the mapping. Creation went through REST (`POST /issues` with labels+milestone) and `groom.py` placed them on the board.
12. **Closed #155 as a duplicate of #162** (08:57 UTC): same Earth-texture follow-up; #162 carries the Director's choice (texture plus translucent plates) and the milestone.
13. **Complexity routing (Director, process PR #189, 23:30 UTC)**: Tech Lead labels engineer issues `complexity:*`; Producer routes by tier against seat effort levels and never assigns an unlabelled issue. Tooling support in #188.

## Open questions I'd raise as `design-decision` if pressed

- None blocking. Candidates noted in issues: whether missions expire into a penalty (assumed yes, #61), whether repair costs scale linearly with damage (assumed yes, #64), whether the overworld Earth map is a three.js scene (assumed yes per architecture §4; #74) rather than SVG.

## Gotchas

- **GitHub API budget (Director, 05:41 UTC, studio-wide):** 5000 calls/hour shared by every agent on one account. Poll at most once per 5 minutes (monitor included), prefer REST (`gh api repos/BenjaminBenetti/tut/...`) over `gh issue list` / `gh pr list` (GraphQL), request only needed fields, batch calls per tick, check `gh api rate_limit` on errors and back off. `groom.py` reads via REST and uses GraphQL only for project-field writes (no REST exists for Projects v2). Seat labels and comments: `gh api -X POST .../issues/N/labels` and `.../comments`.
- A persistent Monitor (session-local) runs `autofill.py` (scratchpad; to be committed under `tools/producer/`) every 5 minutes: for each live seat with no open `seat:eng-N` issue it labels the highest-priority Ready, tiered, unseated issue routed by tier (default seat: high>medium>low; medium seat: medium>low), posts the assignment comment, and prints `AUTOFILL`; it also prints Producer mentions. The 15-minute cron still runs the full groom. A replacement must re-arm both.
- **Never push a follow-up commit to an open PR.** The Tech Lead merges within one to two minutes; twice a later commit was stranded on a merged branch (#94, #98). Open a new PR instead.
- Run every `gh` call with `-R BenjaminBenetti/tut` or from `/workspaces/tut`; from another cwd `gh` cannot infer the repo.
- `git` remote was SSH and unauthenticated; switched to HTTPS with `gh auth setup-git`.
- Issue numbers interleave with PR numbers; `gh api repos/.../issues/N` tells you which is which (`pull_request` key).
- Sub-issue links exist (REST `sub_issues`), so the board's "Parent issue" field works; the task lists in epic bodies are the human-readable copy and must be kept in sync by hand.
- `groom.py` on `main` may lag the scratchpad copy while a `chore(producer)` PR is open; run the newest copy. The dependency parser drops merged PR numbers and treats a leading "none" as no deps (fix in #98).
- MapGen's chain #21 → #29 is strictly serial; only #18/#19/#20 fan out after #17. Expect M1.5 to be paced by one PR at a time.
