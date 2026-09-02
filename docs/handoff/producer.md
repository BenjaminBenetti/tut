# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-02 04:57 UTC)

| Milestone | done / total |
|---|---|
| M0 Foundation | 6 / 10 |
| M1 Overworld | 2 / 54 |
| M1.5 Map Generation | 3 / 21 |

Board: Backlog 58 · Ready 11 · In Progress 4 · In Review 1 · Blocked 0 · Done 11

**Ready now** (no unmerged dependencies):

- #43 (engineer) overworld: Earth map model, ids and query helpers
- #47 (engineer) app: GameStore — observable state container with command dispatch
- #53 (engineer) economy: transaction service
- #8 (tech-lead) feat(app): app/ bootstrap and screen router with placeholder screens
- #9 (tech-lead) feat(graphics): isometric camera rig
- #11 (tech-lead) docs(adr): initial ADRs — toolchain, layering enforcement, state and command pattern
- #18 (mapgen) feat(mapgen): map validator, reachability service, ASCII renderer
- #20 (mapgen) feat(mapgen): pipeline runner — GenerationPass, GenerationContext, MapDraft, labelled RNG forks
- #102 (art-director) Art: UI theme stylesheet (tokens, chamfer panels, buttons, tables, meters) and 24 px icon set
- #106 (engineer) content: mission type model and data
- #107 (engineer) overworld: event type model and starter event data

**In-flight PRs** (age h / idle h / review):

- #104 0.0h / 0.0h / none — feat(roster): mech part model and starter part catalogue (#46)

**In progress** (branch pushed?):

- #93 yes — Art: placeholder batch 2 — models for every mapgen surface and prop kind

**Blocked**:

- none

**Next assignments for idle engineers** (Ready first, then what unblocks next):

1. #43 — overworld: Earth map model, ids and query helpers
2. #47 — app: GameStore — observable state container with command dispatch
3. #53 — economy: transaction service
4. #106 — content: mission type model and data
5. #107 — overworld: event type model and starter event data
6. #48 — roster: mech and loadout model (Ready once #46 merges)
<!-- digest:end -->

**Risks** (hand-written, 04:58 UTC):

- Engineer-Ready is five (#43, #47, #53, #106, #107) with four engineers already active; #46 merging opens #48, #43 merging opens #50, #52, #105. Watch this every tick.
- #54 (GameState root) must fit #7's root and ADR 0003 (#11, still open); a mismatch costs a day on the critical path.
- M1.5 is a serial chain from #21 to #29; a slow review on any one pass stalls the milestone.
- Engineers took #9 (camera rig) although Owner said tech-lead; fine, but the Tech Lead should know #8 is now the only M0 item nobody has claimed.

---


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
- Loop every ~15 min: `git pull`, run groom, read new comments addressed to Producer, chase PRs idle > 3 h and In Progress issues with no branch > 3 h, regenerate this file's digest, push the handoff PR when the digest changed materially.

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

## Open questions I'd raise as `design-decision` if pressed

- None blocking. Candidates noted in issues: whether missions expire into a penalty (assumed yes, #61), whether repair costs scale linearly with damage (assumed yes, #64), whether the overworld Earth map is a three.js scene (assumed yes per architecture §4; #74) rather than SVG.

## Gotchas

- Run every `gh` call with `-R BenjaminBenetti/tut` or from `/workspaces/tut`; from another cwd `gh` cannot infer the repo.
- `git` remote was SSH and unauthenticated; switched to HTTPS with `gh auth setup-git`.
- Issue numbers interleave with PR numbers; `gh api repos/.../issues/N` tells you which is which (`pull_request` key).
- Sub-issue links exist (REST `sub_issues`), so the board's "Parent issue" field works; the task lists in epic bodies are the human-readable copy and must be kept in sync by hand.
- `groom.py` on `main` may lag the scratchpad copy while a `chore(producer)` PR is open; run the newest copy. The dependency parser drops merged PR numbers and treats a leading "none" as no deps (fix in #98).
- MapGen's chain #21 → #29 is strictly serial; only #18/#19/#20 fan out after #17. Expect M1.5 to be paced by one PR at a time.
