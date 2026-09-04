# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-04 15:49 UTC)

| Milestone | done / total |
|---|---|
| M0 Foundation | 13 / 13 |
| M1 Overworld | 64 / 64 |
| M1.5 Map Generation | 33 / 34 |

Board: Backlog 3 · Ready 15 · In Progress 1 · In Review 4 · Blocked 0 · Done 271

**Engineer seats** (one open issue per seat; Producer assigns via `seat:eng-N`; route by `complexity:*` — high → default-effort seats only, low → medium-effort seats first):

| Seat | Effort | Current | Status | Last merged |
|---|---|---|---|---|
| eng-3 | high | #424 refactor(graphics): rename the Isometric* camera rig now that it carries two projections | Ready | #679 |
| eng-4 | low | #497 tactical: difficulty tuning pass against auto-resolve expectations (re-files #345) | In Review | #595 |
| eng-5 | low | #688 bug(qa): tactical-hud.spec races the preview unit load, failing unrelated PRs | In Review | #141 |

⚠ unassigned Ready: #457 (medium), #447 (high), #477 (low), #591 (low), #594 (low), #626 (low), #673 (low), #685 (no complexity label), #709 (low), #716 (no complexity label) · need Tech Lead complexity label before assignment: #685, #716

**Ready now** (no unmerged dependencies):

- #424 (engineer) refactor(graphics): rename the Isometric* camera rig now that it carries two projections
- #457 (engineer) Tactical VFX playback: tracer between shooter and target, claw slash for melee, burst on bug death
- #447 (engineer) mapgen: M3 archetypes — hive and spore crash site, design sketch
- #450 (art-director) Art: redraw the Earth map as a true equirectangular projection
- #477 (engineer) Overlapping hook markers z-fight: a tile that is both deploy and extraction shows whichever batch happens to draw last
- #591 (engineer) design-decision: rural maps are nearly transparent under fog of war — no tree blocks sight
- #594 (engineer) ui(mech-bay): a utility slot reads as a missing thumbnail rather than a part with no picture
- #615 (art-director) art: the sight cue needs its own treatment, not a reused line-of-sight ring
- #626 (engineer) graphics: SLAB_HEIGHT and GROUND_SLAB_THICKNESS are two answers to "how thick is a ground tile"
- #673 (engineer) art(ui): four stat-sheet icons — firepower, accuracy, heat, weight
- #685 (engineer) design-decision: bugs can never reach the squad unseen — ambush is impossible on current maps
- #694 (art-director) feat(ui): the mech bay has no picture of the mech you are building
- #709 (engineer) test(e2e): the side-rail spec samples data-overflow instead of waiting for it
- #712 (mapgen) chore(mapgen): temperate is the only biome whose boulders are not clustered — record the intent either way
- #716 (engineer) feat(bugs): give the lurker a last-known position, so seeking cover is not forgetting

**In-flight PRs** (age h / idle h / review):

- #717 0.1h / 0.1h / n/a — refactor(mapgen): a prop pass requires what its placements need (#714)
- #715 0.1h / 0.1h / n/a — fix(qa): give the preview a signal that means the units are placed (#688)
- #713 0.2h / 0.2h / n/a — feat(graphics): the egg burst plays when charges finish a spawner (#697)
- #711 0.2h / 0.0h / n/a — test(tactical): let the sweep's turn cap be set, so the deep curve is one command
- #708 0.4h / 0.1h / n/a — docs(tactical): the measured difficulty curve, and which lever moves it (#666)

**In progress** (branch pushed?):

- #502 yes — Art: bugs read as dark blobs on dark ground — the chitin silhouette has no edge at 64 px

**Blocked**:

- none

**Next assignments for idle engineers** (Ready first, then what unblocks next):

1. #424 — refactor(graphics): rename the Isometric* camera rig now that it carries two projections
2. #457 — Tactical VFX playback: tracer between shooter and target, claw slash for melee, burst on bug death
3. #447 — mapgen: M3 archetypes — hive and spore crash site, design sketch
4. #477 — Overlapping hook markers z-fight: a tile that is both deploy and extraction shows whichever batch happens to draw last
5. #591 — design-decision: rural maps are nearly transparent under fog of war — no tree blocks sight
6. #594 — ui(mech-bay): a utility slot reads as a missing thumbnail rather than a part with no picture
7. #626 — graphics: SLAB_HEIGHT and GROUND_SLAB_THICKNESS are two answers to "how thick is a ground tile"
8. #673 — art(ui): four stat-sheet icons — firepower, accuracy, heat, weight
9. #685 — design-decision: bugs can never reach the squad unseen — ambush is impossible on current maps
10. #709 — test(e2e): the side-rail spec samples data-overflow instead of waiting for it
11. #716 — feat(bugs): give the lurker a last-known position, so seeking cover is not forgetting
<!-- digest:end -->


> Everything below the digest is hand-written. The digest above is regenerated; this is not.

## Read this first

You are the Producer for Terra Under Threat. You own the project board, issue decomposition, priorities, and which engineer seat works what. You do **not** write game code, and you do **not** decide design questions — you route them to the Director with a recommended default.

**Where the project is (2026-09-04 15:55 UTC).** M0, M1 and M1.5 are closed. **M2 Basic Missions** is 47/50 and effectively done. **M2.5 Tactical Feel** is 25/27 and answers the Executive Director's first playtest in full — controls, readability, combat feedback, fog of war, per-weapon attacks, squads attacking twice. Three releases shipped today: v0.2.1, v0.2.2, v0.2.3, all live on GitHub Pages.

**What is deliberately not happening: M3.** The Director is holding it until the Executive Director plays v0.2.3 and steers, because his last round of feedback reshaped an entire milestone. Do not decompose M3. MapGen's crash-site prototype (#662) is sanctioned exploratory groundwork; the hive is not started and waits on two design answers in #447.

## The seats

Three live seats, all Opus. **eng-3** runs at max effort, **eng-4** and **eng-5** at xhigh. eng-1, eng-2 and eng-6 are stopped for good; their `seat:eng-N` labels say INACTIVE and the tooling skips them.

Assign by putting exactly one `seat:eng-N` label on a Ready issue. One open issue per seat, except where the Director says otherwise. **The tier rule was relaxed on 2026-09-04: every seat can take `complexity:high`; eng-3 is merely offered it first.** The seat label descriptions still say MEDIUM for eng-4/eng-5 — stale, and the tooling overrides it in code.

Current, confirmed against the live labels at 15:50 UTC: **eng-3 #424**, **eng-4 #497** (In Review), **eng-5 #688** (In Review, PR #715). No seat is idle. #666 closed; the loop seated eng-3 on #424 at 15:42 and nothing has started on it, so it is still cheap to re-route if something better than a p3 rename turns up.

**Two seats are one merge away from free and the eligible queue behind them is three items deep** — #477, #626, #709, all `complexity:low`. Everything richer is held or parked: #457 behind the Art Director (below), #447 behind the M3 embargo, #594 behind an Art Director choice, #591 and #685 behind the Director. #716 would be the fourth the moment the Tech Lead tiers it. If the Executive Director's playtest answer is days away rather than hours, the honest read is that this pool runs out of substantive work before it runs out of seats.

## The tooling — read before you touch a seat

Two scripts are committed under `tools/producer/`. **`autofill.py` is not committed** — it lives only in a session scratchpad and is copied forward by hand from one Producer to the next. Mine is at `/tmp/claude-1000/-workspaces-tut/6edc8b21-3d58-4e11-b3ed-10cf5e542323/scratchpad/autofill.py`, copied from my predecessor's session. **Copy it into your own scratchpad before you arm anything**, and consider finally landing it under `tools/producer/` in a `chore(producer):` PR; one instance refresh with nobody holding a copy loses the seat loop entirely.

- **`groom.py`** — reads every issue and PR through **REST** (the shared GraphQL budget is exhausted regularly; `gh api rate_limit` lies about it, so try a call rather than trusting the endpoint) and syncs the project board's Status and Owner. Board writes are the only GraphQL it uses. Run it every tick. It writes `.producer/digest.json`.
- **`render_handoff.py`** — splices the digest into this file between the `digest:start` / `digest:end` markers. Everything outside the markers is yours to write.
- **`autofill.py`** — the seat-refill loop, run every 5 minutes by a background Monitor. For each live seat with no open seat-labelled issue it picks the best candidate and labels it, posting a `**Producer**` comment.

**Selection precedence, in order:** priority (p0→p3) → milestone (`MILESTONE_RANK`: M2.5 above M2 above the rest) → the richer tier the seat can take → issue number. Getting that order wrong cost six false starts on one issue; do not "simplify" it.

**Two control files, both git-ignored, in `.producer/`:**
- `hold.txt` — issue numbers the loop must never seat. Currently **457, 594, 447**; I pruned 343, 524, 526 and 529, all long closed. **It is a bare list of integers with nowhere to say why**, and a `#` comment would make `int()` throw inside a bare `except` that silently sets the hold list to *empty* — i.e. a well-meant annotation quietly un-holds everything. Until the parser is fixed, the reason for every hold goes in the table below **and** as a comment on the issue; I lost twenty minutes re-deriving why #457 was held.
- `release-allowlist.txt` — when present, the loop seats **only** from this ordered list and prints HOLD otherwise. Create it to freeze scope for a release; delete it to lift.

**The loop never auto-seats `area:art`, `area:qa` or `area:mapgen`** — those belong to the Art Director, QA and MapGen, who self-direct. When an engineer genuinely should take one, label it by hand; that is the designed escape hatch, not a workaround.

## What owes whom

| Item | Waiting on |
|---|---|
| **#281** target cover density | Executive Director, from play. MapGen has re-measured against shipped rules. |
| **#450** redraw the Earth map | Art Director. Cosmetic; fine to move to Track: Arsenal. |
| **#594** mech-bay utility slot | Art Director, choosing between three options. On hold. |
| **#652** unit card at 720p | Art Director: may `range · acc · dmg · pen` be abbreviated? Three answers offered. |
| **#685, #591** | Design calls filed with options, waiting on the Director. (#679 landed as #710.) |
| **#457** VFX playback | **The Art Director's PR #713, not priority.** #697 item 2 rewrites `tactical-animation-queue.ts` frame stepping; #457 needs the same seam in the same file. Assets are ready (#436 merged). Seat it the moment #713 merges — it is the last non-epic item in M2.5 and it is p1. |
| **#716** lurker memory | Tech Lead, for a `complexity:*` label. Untiered issues are invisible to my loop. My read is medium. |
| **#320, #514** epics | Close when the Director says the milestones are done. |
| **#447** hive archetype | Two design answers: are hive caverns mech-passable, and how big is a hive. **The first decides whether every mech sits out the assault mission M3 is built around.** |

## Failure classes this studio has actually hit

Written into `studio.md` §3 by the Tech Lead as *"a green suite is not a working screen"*. Every instance passed CI and did nothing on screen:

- Every tactical overlay under the ground slab for an hour (#555), because `tileTop` named the slab **centre** (#557).
- 42 icons and 30 thumbnails registered with zero consumers (#495).
- A radial ring built, tested and never called (#528 → #529).
- Egg spawners undrawn, so the objective was invisible (#484).
- The camera opening away from the player's own units (#538).
- A sight overlay fed the wrong collection: 0 tiles marked against 119 that could see.

**And the same class inside my own tooling**, which is the lesson I would most want you to inherit: a start-comment guard I wrote called `gh("api", ...)` when the helper already prepends `api`, so every call errored, a bare `except` swallowed it, and the guard was **inert from the day it was written** — discovered only when #108 was built twice. Assert that your own checks fire. A guard that has never reported anything is not evidence of safety.

## Habits that have paid

- **Verify before closing or seating.** #344 and #190 were closed as already-delivered; #190 had a seat on it first. The board is old enough that some Ready issues describe shipped work.
- **Check for a start comment before labelling.** Labels lag by minutes; comments do not. Automated now, but do it by eye on anything important.
- **Duplicates are frequent** — #566/#569, #462/#460, #190/#191, #479/#484, #664/#684, #688/#691. Search before filing from someone else's note.
- **Cross-issue collisions cannot be detected from labels.** Two seats writing the same patch under different issue numbers has happened twice; both times a person caught it at review. Encourage that.
- **When a single measurement is about to change a release decision, ask what the harness did.** I called a no-go on QA's report that a mech closed 14 tiles in 40 turns; their driver was walking the mech into a building it cannot enter. Corrected in 12 minutes. Later, #666's "missions never resolve" turned out to be the sweep pinning a turn-cap artifact as a rule.
- **Say what is parked and why.** #497's tuning half and MapGen's yard parapets are both held because they move what the Executive Director is about to judge.

## Cadence

Grooming tick every 15 minutes by cron; seat-refill loop every 5 minutes by Monitor; handoff PR at least hourly, titled `chore(handoff): producer <date>`, carrying **only this file** (the Tech Lead asked for tooling to go in separate `chore(producer):` PRs). A replacement must re-arm both the cron and the Monitor — they are session-local and die with the session.

## What I would do next

1. **Watch PR #713.** When it merges, drop `457` from `.producer/hold.txt` and seat #457 — that closes M2.5 down to its epic. It is the single highest-value thing on my board and it is purely a sequencing wait.
2. **Get #716 tiered** (asked at 15:47) so the loop can see it, and keep asking on every newly filed issue — untiered work does not exist as far as the seat loop is concerned.
3. Get the Executive Director's playtest answer. Three of M3's five clusters depend on it, and #281 and #497's tuning half are parked behind it. **It is now also what the queue depth depends on** — see the seats section.
4. Close M2 by moving #450 to Track: Arsenal and taking the #281 call, or accept it sits at 47/50 until he plays.
5. Land `autofill.py` under `tools/producer/` in a `chore(producer):` PR, and give `hold.txt` a parser that tolerates `#` comments and fails loudly instead of silently emptying itself.

## Session log — 2026-09-04, successor's first tick (15:45–15:55 UTC)

- Confirmed the seat map against live labels; no seat idle, nothing re-routed.
- Pruned four closed issues out of `hold.txt`; recorded the reason for all three that remain.
- Established that **#457's hold is a file collision with PR #713, not a priority call**, and said so on the issue with an offer to fold it into #697 if the Art Director would rather do both in one pass.
- Labelled the nine issues filed since the last tick that had no priority (#591 #673 #685 #694 #697 #709 #712 #714 #716), and gave #591 #685 #694 #709 #716 the `area:*` / `type:*` labels they were missing.
- Re-tagged **#673** from `area:ui` to `area:art`: it is four icons *asked of* the Art Director, and under `area:ui` my loop would have cheerfully seated an engineer on drawing them.
- Asked the Tech Lead to tier #716.
- Re-armed both loops (they die with the session): the 5-minute Monitor and a 15-minute grooming cron.
