# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

## Status Digest (2026-09-02 04:50 UTC)

| Milestone | done / total |
|---|---|
| M0 Foundation | 5 / 10 |
| M1 Overworld | 0 / 50 |
| M1.5 Map Generation | 1 / 20 |

Board: Backlog 65 · Ready 5 · In Progress 1 · In Review 3 · Blocked 0 · Done 6

**Ready now** (no unmerged dependencies):

- #43 (engineer) overworld: Earth map model and seed data
- #44 (engineer) economy: credits state and transaction model
- #45 (engineer) roster: infantry squad model and squad type data
- #46 (engineer) roster: mech part model and starter part catalogue
- #11 (tech-lead) docs(adr): initial ADRs — toolchain, layering enforcement, state and command pattern

**In-flight PRs** (age h / idle h / review):

- #96 0.0h / 0.0h / none — docs(art): regenerate infantry squad concept with kneeling front rank (#3)
- #95 0.0h / 0.0h / none — feat(mapgen): biome, settlement and map-size data + parameter resolution (#19)
- #94 0.0h / 0.0h / none — chore(handoff): producer 2026-09-02
- #92 0.1h / 0.1h / none — chore(handoff): art-director 2026-09-02 (update 2)
- #89 0.1h / 0.0h / none — feat(art): deterministic placeholder GLB models and build tooling (#4)
- #88 0.1h / 0.1h / none — feat(mapgen): map model, tile index, surface and prop registries (#17)

**In progress** (branch pushed?):

- none

**Blocked**:

- none

**Next assignments for idle engineers** (Ready first, then what unblocks next):

1. #43 — overworld: Earth map model and seed data
2. #44 — economy: credits state and transaction model
3. #45 — roster: infantry squad model and squad type data
4. #46 — roster: mech part model and starter part catalogue
5. #18 — feat(mapgen): map validator, reachability service, ASCII renderer (Ready once #17 merges)
6. #20 — feat(mapgen): pipeline runner — GenerationPass, GenerationContext, MapDraft, labelled RNG forks (Ready once #17 merges)

**Risks**:

- M1 Ready queue is four data-model issues; it widens only as #43 merges (unblocks #50, #51, #52) and #7/#8/#11 land (unblocks #47, #53, #54). If engineers outpace the Tech Lead's M0 merges, they idle.
- #54 (GameState root) must fit #7's root and ADR 0003; a mismatch costs a rework day on the critical path.
- Biome / settlement ids: #43 and MapGen #19 must agree (comment on #19). Whoever lands second reconciles.
- M1.5 is one serial chain of passes; a slow review on any one stalls the whole milestone.
- #29 is oversized (flagged on #32).

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
| #35 World model, state root, commands | M1 | #43 #54 #55 #56 |
| #36 Infestation, threat, end conditions | M1 | #50 #57 #58 #59 #68 |
| #37 Economy | M1 | #44 #53 #60 |
| #38 Roster | M1 | #45 #46 #48 #49 #63 #64 #69 |
| #39 Missions, events, auto-resolve | M1 | #51 #61 #62 #67 #70 #71 |
| #40 Deployables | M1 | #52 #65 #66 |
| #41 Overworld presentation | M1 | #47 #72 #73 #74 #75 #76 #77 #78 |
| #42 Roster / mech bay / deployment UI + e2e | M1 | #79 #80 #81 #82 #83 #84 |
| #32 Map generation (MapGen owns) | M1.5 | #13 #17–#31 #33 #85 |
| M0 skeleton (Tech Lead owns, no epic) | M0 | #2–#11 |

Critical path for M1: #43 → #54 (needs #7, #11, #44, #45, #48) → #55 → #68 (AdvanceDay) → #72/#73 (screens) → #82/#83 → #84 e2e.

## How I work

- Grooming script: `tools/producer/groom.py` (`python3 tools/producer/groom.py [--dry]`), then `python3 tools/producer/render_handoff.py` to regenerate this file's digest from `.producer/digest.json` plus `tools/producer/handoff_static.md` (the hand-written half). It reads every issue, PR and remote branch, then sets Status: closed → Done; open PR referencing the issue (`Closes #N`, `(#N)` in title, or branch `type/N-slug`) → In Review; remote branch `type/N-*` → In Progress; label `status:blocked` → Blocked; every `Blocked by #N` in the Dependencies section closed → Ready; else Backlog. Epics go In Progress once any child leaves Backlog/Ready and Done when all children close. Missing issues are added to the board with Owner inferred from labels (mapgen / art / qa / M0→tech-lead / epic→producer / else engineer).
- Dependencies are parsed from the `## Dependencies` section, so keep writing `Blocked by #N` there.
- Loop every ~15 min: `git pull`, run groom, read new comments addressed to Producer, chase PRs idle > 3 h and In Progress issues with no branch > 3 h, regenerate this file's digest, push the handoff PR when the digest changed materially.

## Decisions made and why

1. **Did not create an M0 epic or M1.5 issues.** The Tech Lead had filed #5–#11 and MapGen had filed #13, #17–#33 (complete, well-formed, sequenced) while I was drafting. Duplicating would have split the truth. I added only #85, the mission → `MapRecipe` seam, and linked it under #32.
2. **`GameState` root belongs to #7 (save scaffolding), not to M1.** #54 extends it rather than defining a second root. #54, #55 and #47 are blocked on ADR 0003 (#11) so the command/event contract is decided once.
3. **Biome / settlement ids live in `src/content/model/`** (architecture §4) and are created by #43; MapGen's #19 keys its definitions on them. Names aligned to MapGen's `rural | town | city`. Comment left on #19.
4. **Four M1 issues Ready before the M0 skeleton is complete** (#43, #44, #45, #46): they are pure data models with tests and need only the merged tooling (#5). Everything that needs `core/` Result types, the router, save or the camera rig stays Backlog until those merge.
5. **Sizes**: every child is a half day to a day; #54, #49, #58, #61–#64, #67, #68, #72–#75, #79, #80, #82 are the full-day ones.
6. **Owner on child issues is the role expected to take it**, not a person. The Director spawns engineers against Ready.

## Open questions I'd raise as `design-decision` if pressed

- None blocking. Candidates noted in issues: whether missions expire into a penalty (assumed yes, #61), whether repair costs scale linearly with damage (assumed yes, #64), whether the overworld Earth map is a three.js scene (assumed yes per architecture §4; #74) rather than SVG.

## Gotchas

- Run every `gh` call with `-R BenjaminBenetti/tut` or from `/workspaces/tut`; from another cwd `gh` cannot infer the repo.
- `git` remote was SSH and unauthenticated; switched to HTTPS with `gh auth setup-git`.
- Issue numbers interleave with PR numbers; `gh api repos/.../issues/N` tells you which is which (`pull_request` key).
- Sub-issue links exist (REST `sub_issues`), so the board's "Parent issue" field works; the task lists in epic bodies are the human-readable copy and must be kept in sync by hand.
- MapGen's chain #21 → #29 is strictly serial; only #18/#19/#20 fan out after #17. Expect M1.5 to be paced by one PR at a time.
