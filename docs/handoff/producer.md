# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-02 17:02 UTC)

| Milestone | done / total |
|---|---|
| M0 Foundation | 10 / 11 |
| M1 Overworld | 19 / 62 |
| M1.5 Map Generation | 11 / 23 |

Board: Backlog 26 · Ready 7 · In Progress 8 · In Review 15 · Blocked 0 · Done 42

**Engineer seats** (one open issue per seat; Producer assigns via `seat:eng-N`):

| Seat | Current | Status | Last merged |
|---|---|---|---|
| eng-1 | IDLE | - | #57 |
| eng-2 | IDLE | - | #54 |
| eng-3 | #8 feat(app): app/ bootstrap and screen router with placeholder screens | In Review | #106 |
| eng-4 | #56 save: overworld GameState save, load, export and import | In Review | #10 |
| eng-5 | IDLE | - | #74 |
| eng-6 | IDLE | - | #51 |

⚠ idle: eng-1, eng-2, eng-5, eng-6 · unassigned Ready: #49, #52, #58, #59, #61, #108, #141

**Ready now** (no unmerged dependencies):

- #49 (engineer) roster: loadout validation and mech stat sheet service
- #52 (engineer) overworld: deployable model and type data
- #58 (engineer) overworld: infestation spread and seeding
- #59 (engineer) overworld: lose condition and win stub
- #61 (engineer) overworld: mission generation and expiry tick
- #108 (engineer) refactor(core): promote generic id Registry to core/ and reuse in mapgen and roster
- #141 (engineer) refactor: rename scalar tuning exports to UPPER_SNAKE_CASE (economy-tuning, threat-tuning)

**In-flight PRs** (age h / idle h / review):

- #186 7.1h / 7.1h / n/a — chore(handoff): producer 2026-09-02 (update 7)  ⚠ needs review
- #185 7.5h / 7.5h / n/a — feat(mapgen): stairwell holes prefer interior columns so facades stay whole (#184)  ⚠ needs review
- #183 7.5h / 7.5h / n/a — feat(mapgen): scale building count by map area (#182)  ⚠ needs review
- #181 7.6h / 7.6h / n/a — docs(adr): align ADR 0004 wording with the M1.5 implementation  ⚠ needs review
- #180 7.6h / 7.6h / n/a — feat(mapgen): mission → MapRecipe adapter with difficulty-scaled hook requirements (#85)  ⚠ needs review
- #179 7.6h / 7.6h / n/a — feat(mapgen): preview harness — second Vite entry rendering generated maps (#31)  ⚠ needs review
- #178 7.8h / 7.8h / n/a — chore(handoff): mapgen 2026-09-02 (update 3)  ⚠ needs review
- #177 7.8h / 7.7h / n/a — test(mapgen): property sweep across seeds, golden seeds, fork stability (#30)  ⚠ needs review
- #176 7.9h / 7.7h / n/a — feat(mapgen): settlement pipeline factory and generateTacticalMap entry (#97)  ⚠ needs review
- #175 7.9h / 7.9h / n/a — feat(graphics): Earth map texture, glyph markers and four-stop ramp on the overworld scene (#162)  ⚠ needs review
- #174 7.9h / 7.7h / n/a — feat(mapgen): connectivity repair pass (#29)  ⚠ needs review
- #173 8.0h / 7.7h / n/a — feat(mapgen): hook placers — deploy, egg spawner, edge spawn, extraction + hook pass (#28)  ⚠ needs review
- #171 11.2h / 7.9h / n/a — feat(app): app bootstrap, DOM screen router and placeholder screens (#8)  ⚠ needs review
- #170 11.3h / 7.7h / n/a — feat(mapgen): ramp pass — ground connectivity across one-level steps (#27)  ⚠ needs review
- #168 11.3h / 11.3h / n/a — docs: GitHub API budget rules in CLAUDE.md  ⚠ needs review
- #167 11.3h / 11.3h / n/a — feat(economy): per-day stipend income — computeStipend and applyStipend through the transaction service (#60)  ⚠ needs review
- #166 11.3h / 11.3h / n/a — feat(save): GameState save, load, export and import (#56)  ⚠ needs review
- #165 11.3h / 11.3h / n/a — feat(ui): unit and mech-part thumbnails, thumbnail manifest, shared preview server (#163)  ⚠ needs review
- #164 11.4h / 7.7h / n/a — feat(mapgen): prop pass — vegetation, street clutter, yard cover, interior storage (#26)  ⚠ needs review

**In progress** (branch pushed?):

- #55 yes — overworld: command and event types with a command dispatcher

**Blocked**:

- none

**Next assignments for idle engineers** (Ready first, then what unblocks next):

1. #49 — roster: loadout validation and mech stat sheet service
2. #52 — overworld: deployable model and type data
3. #58 — overworld: infestation spread and seeding
4. #59 — overworld: lose condition and win stub
5. #61 — overworld: mission generation and expiry tick
6. #108 — refactor(core): promote generic id Registry to core/ and reuse in mapgen and roster
7. #141 — refactor: rename scalar tuning exports to UPPER_SNAKE_CASE (economy-tuning, threat-tuning)
8. #33 — chore(infra): Vite multi-page input for mapgen-preview.html (Ready once #31 merges)
<!-- digest:end -->

**Status: PRODUCTION PAUSED by the Executive Director (Director, 2026-09-02 ~17:00 UTC) until further notice.**

- Engineer pool reduced to two live seats: eng-3 (#8, PR #171) and eng-4 (#56, PR #166). eng-1, eng-2, eng-5, eng-6 are stopped by the Director; their idle rows in the seat table above are intentional and are not to be escalated.
- #52 and #55 returned to Ready (#55 has parked WIP on `feat/55-overworld-command-dispatcher`). #60 (PR #167) and #162 (PR #175) keep their open PRs for a live seat to adopt when work resumes.
- Producer during the pause: no new assignments, no spawns, seat-refill monitor stopped, light grooming tick every 30 minutes, digest kept accurate. Fifteen PRs remain In Review awaiting the Tech Lead.

**Risks** (hand-written, 17:00 UTC):

- Studio stalled 05:49 → 08:53 after the shared API quota ran dry; every agent polls at most every 5 minutes.
- On resume: seat #55 first (it gates #72), adopt PRs #167 and #175 onto live seats, then refill from #49, #58, #59, #61, #108, #141.

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
| #32 Map generation (MapGen owns) | M1.5 | #13 #17–#31 #33 #97 #85 |
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
12. **Closed #155 as a duplicate of #162** (08:57 UTC): same Earth-texture follow-up; #162 carries the Director's choice (texture plus translucent plates) and the milestone.

## Open questions I'd raise as `design-decision` if pressed

- None blocking. Candidates noted in issues: whether missions expire into a penalty (assumed yes, #61), whether repair costs scale linearly with damage (assumed yes, #64), whether the overworld Earth map is a three.js scene (assumed yes per architecture §4; #74) rather than SVG.

## Gotchas

- **GitHub API budget (Director, 05:41 UTC, studio-wide):** 5000 calls/hour shared by every agent on one account. Poll at most once per 5 minutes (monitor included), prefer REST (`gh api repos/BenjaminBenetti/tut/...`) over `gh issue list` / `gh pr list` (GraphQL), request only needed fields, batch calls per tick, check `gh api rate_limit` on errors and back off. `groom.py` reads via REST and uses GraphQL only for project-field writes (no REST exists for Projects v2). Seat labels and comments: `gh api -X POST .../issues/N/labels` and `.../comments`.
- During the pause there is no merge monitor; a 30-minute cron runs the light grooming tick. On resume: re-arm a REST monitor polling merged PRs and Producer mentions every 5 minutes, and return the cron to 15 minutes.
- **Never push a follow-up commit to an open PR.** The Tech Lead merges within one to two minutes; twice a later commit was stranded on a merged branch (#94, #98). Open a new PR instead.
- Run every `gh` call with `-R BenjaminBenetti/tut` or from `/workspaces/tut`; from another cwd `gh` cannot infer the repo.
- `git` remote was SSH and unauthenticated; switched to HTTPS with `gh auth setup-git`.
- Issue numbers interleave with PR numbers; `gh api repos/.../issues/N` tells you which is which (`pull_request` key).
- Sub-issue links exist (REST `sub_issues`), so the board's "Parent issue" field works; the task lists in epic bodies are the human-readable copy and must be kept in sync by hand.
- `groom.py` on `main` may lag the scratchpad copy while a `chore(producer)` PR is open; run the newest copy. The dependency parser drops merged PR numbers and treats a leading "none" as no deps (fix in #98).
- MapGen's chain #21 → #29 is strictly serial; only #18/#19/#20 fan out after #17. Expect M1.5 to be paced by one PR at a time.
