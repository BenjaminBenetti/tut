# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-04 04:15 UTC)

| Milestone | done / total |
|---|---|
| M0 Foundation | 12 / 13 |
| M1 Overworld | 64 / 64 |
| M1.5 Map Generation | 33 / 34 |

Board: Backlog 6 · Ready 9 · In Progress 4 · In Review 1 · Blocked 0 · Done 155

**Engineer seats** (one open issue per seat; Producer assigns via `seat:eng-N`; route by `complexity:*` — high → default-effort seats only, low → medium-effort seats first):

| Seat | Effort | Current | Status | Last merged |
|---|---|---|---|---|
| eng-3 | default | #330 tactical: objectives, extraction and the TacticalMissionResolver | Ready | #329 |
| eng-4 | medium | #333 ai: lurker — flank through cover and strike from behind | In Review | #331 |
| eng-5 | medium | #335 ai: bug-phase runner | Ready | #409 |

⚠ unassigned Ready: #108 (low), #141 (low), #332 (low), #334 (low), #412 (low), #420 (no complexity label) · need Tech Lead complexity label before assignment: #420

**Ready now** (no unmerged dependencies):

- #108 (engineer) refactor(core): promote generic id Registry to core/ and reuse in mapgen and roster
- #141 (engineer) refactor: rename scalar tuning exports to UPPER_SNAKE_CASE (economy-tuning, threat-tuning)
- #190 (art-director) infra(art): headless Blender + OpenSCAD + trimesh/cadquery toolchain in the devcontainer, with proof render and art-blender skill
- #330 (engineer) tactical: objectives, extraction and the TacticalMissionResolver
- #332 (engineer) ai: swarmer — rush the nearest target and group up
- #334 (engineer) ai: brute — slow advance toward clumps, absorb overwatch
- #335 (engineer) ai: bug-phase runner
- #412 (engineer) bug(tactical): END TURN enters the bugs phase and nothing ever ends it — mission soft-locks at turn 1
- #420 (engineer) Human here.

**In-flight PRs** (age h / idle h / review):

- #418 9.3h / 9.1h / n/a — feat(bugs): lurker behaviour — stalk out of sight, take the tile behind the mark, strike when flanking (#333)  ⚠ needs review

**In progress** (branch pushed?):

- none

**Blocked**:

- none

**Next assignments for idle engineers** (Ready first, then what unblocks next):

1. #108 — refactor(core): promote generic id Registry to core/ and reuse in mapgen and roster
2. #141 — refactor: rename scalar tuning exports to UPPER_SNAKE_CASE (economy-tuning, threat-tuning)
3. #330 — tactical: objectives, extraction and the TacticalMissionResolver
4. #332 — ai: swarmer — rush the nearest target and group up
5. #334 — ai: brute — slow advance toward clumps, absorb overwatch
6. #335 — ai: bug-phase runner
7. #412 — bug(tactical): END TURN enters the bugs phase and nothing ever ends it — mission soft-locks at turn 1
8. #420 — Human here.
<!-- digest:end -->

**Status: PRODUCTION RESUMED** (Director, 2026-09-03 03:05 UTC). Pool: eng-3 (default effort, takes `complexity:high` and anything), eng-4 and eng-5 (medium effort, `complexity:low|medium` only). eng-1, eng-2, eng-6 are gone; their seat labels are inactive.

**Gap audit (03:10 UTC, posted on #35):** closed. Every stopped-seat issue is Done or reseated (#52 → eng-5, #55 → eng-3); #60 and #162 merged.

**v0.1.0 RELEASED — 2026-09-03 13:22 UTC** (Tech Lead): tagged at the #336 squash, Release zip and GitHub Pages deploy succeeded, https://benjaminbenetti.github.io/tut/ serves it. M1 Overworld closed 64/64 (epics #35–#42). QA verified #217's fix post-release; remaining QA bugs #218 #219 #291 #294 #304 #368 are post-release polish.

**FLEET STALLED 2026-09-03 19:09 → 2026-09-04 04:15 UTC (9 h).** No agent but me has spoken since the Tech Lead's 19:09 comment. Nothing merged, no branches pushed. Chases posted on #418, #330, #335 at 04:20.

**Executive Director request #420 (2026-09-03 20:10) sat unlabelled for 8 h** because of that stall. Now specced, `area:engine` / `type:feature` / **p0** / M2, quoted verbatim at the top: the overworld map must render **front-on like XCOM's geoscape, not isometric**, and city markers must sit on their true geographic positions. Tactical stays isometric (GDD §6.1) — I scoped it that way and said so on the issue. Needs a Tech Lead `complexity:*` label before a seat can take it; it is p0 so the autofill loop gives it to the first free seat.

**M2 Basic Missions** (29 of 43 done, 04:20 UTC). Merged: spawning #329, charges/reload #409, AI registry #331, turn engine #328. In flight: #330 resolver (eng-3, no branch), #333 lurker (eng-4, PR #418 conflicted), #335 runner (eng-5, no branch). Remaining after #330: #341 flow (high), #332 / #334 behaviours (low), #343 sim, #344 smoke, #345 tuning.

**Seat plan:** #420 (p0, Executive Director) to the first free seat once tiered. eng-3 (default): #330 → #341. eng-4 (medium): #333 → #343 headless sim. eng-5 (medium): #335 → #332 → #334. Fillers: #412 stopgap, #141, #108.

**Risks / asks** (04:20 UTC):

- **Director: the engineer seats and the Tech Lead have been dead for nine hours.** Three seats hold issues nobody is working (#330, #333, #335) and the Executive Director's own request waited eight hours. This needs respawns, not reseating; the work is correctly assigned and specced.
- Standing ask unchanged: one default-effort seat serialises M2's high chain (#330 → #341).
- #418 is approved on content but conflicted; whoever takes #333 next should start from that branch rather than from scratch.

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
