# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-04 16:56 UTC)

| Milestone | done / total |
|---|---|
| M0 Foundation | 13 / 13 |
| M1 Overworld | 64 / 64 |
| M1.5 Map Generation | 33 / 34 |

Board: Backlog 5 · Ready 11 · In Progress 3 · In Review 3 · Blocked 0 · Done 275

**Engineer seats** (one open issue per seat; Producer assigns via `seat:eng-N`; route by `complexity:*` — high → default-effort seats only, low → medium-effort seats first):

| Seat | Effort | Current | Status | Last merged |
|---|---|---|---|---|
| eng-3 | high | #424 refactor(graphics): rename the Isometric* camera rig now that it carries two projections | In Review | #679 |
| eng-4 | low | #497 tactical: difficulty tuning pass against auto-resolve expectations (re-files #345) | In Progress | #595 |
| eng-5 | low | #709 test(e2e): the side-rail spec samples data-overflow instead of waiting for it | In Review | #688 |

⚠ unassigned Ready: #457 (medium), #447 (high), #477 (low), #594 (low), #626 (low), #673 (low)

**Ready now** (no unmerged dependencies):

- #457 (engineer) Tactical VFX playback: tracer between shooter and target, claw slash for melee, burst on bug death
- #447 (engineer) mapgen: M3 archetypes — hive and spore crash site, design sketch
- #450 (art-director) Art: redraw the Earth map as a true equirectangular projection
- #477 (engineer) Overlapping hook markers z-fight: a tile that is both deploy and extraction shows whichever batch happens to draw last
- #594 (engineer) ui(mech-bay): a utility slot reads as a missing thumbnail rather than a part with no picture
- #615 (art-director) art: the sight cue needs its own treatment, not a reused line-of-sight ring
- #626 (engineer) graphics: SLAB_HEIGHT and GROUND_SLAB_THICKNESS are two answers to "how thick is a ground tile"
- #673 (engineer) art(ui): four stat-sheet icons — firepower, accuracy, heat, weight
- #694 (art-director) feat(ui): the mech bay has no picture of the mech you are building
- #712 (mapgen) chore(mapgen): temperate is the only biome whose boulders are not clustered — record the intent either way
- #728 (art-director) chore(design): the fog review captures have no refresh trigger left, and are 29 commits stale

**In-flight PRs** (age h / idle h / review):

- #729 0.1h / 0.1h / n/a — test(e2e): wait for the side rail's overflow cue, and require the overflow (#709)
- #727 0.6h / 0.6h / n/a — chore(handoff): qa — the gate was missing pnpm test:sim
- #726 0.7h / 0.6h / n/a — refactor(graphics): the camera rig is orthographic, not isometric (#424)
- #724 0.8h / 0.8h / n/a — chore(handoff): mapgen 2026-09-04 (session 3, update 7)
- #722 0.9h / 0.3h / n/a — feat(bugs): remember where a side last saw each enemy (#716)
- #720 1.1h / 1.1h / n/a — chore(producer): commit the seat autofill loop, and let its hold list say why

**In progress** (branch pushed?):

- #497 yes — tactical: difficulty tuning pass against auto-resolve expectations (re-files #345)
- #502 yes — Art: bugs read as dark blobs on dark ground — the chitin silhouette has no edge at 64 px
- #701 yes — fix(mapgen): desert palms are the only tree in the game placed singly — the cluster is missing from the biome entry

**Blocked**:

- none

**Next assignments for idle engineers** (Ready first, then what unblocks next):

1. #457 — Tactical VFX playback: tracer between shooter and target, claw slash for melee, burst on bug death
2. #447 — mapgen: M3 archetypes — hive and spore crash site, design sketch
3. #477 — Overlapping hook markers z-fight: a tile that is both deploy and extraction shows whichever batch happens to draw last
4. #594 — ui(mech-bay): a utility slot reads as a missing thumbnail rather than a part with no picture
5. #626 — graphics: SLAB_HEIGHT and GROUND_SLAB_THICKNESS are two answers to "how thick is a ground tile"
6. #673 — art(ui): four stat-sheet icons — firepower, accuracy, heat, weight
<!-- digest:end -->


> Everything below the digest is hand-written. The digest above is regenerated; this is not.

## Read this first

You are the Producer for Terra Under Threat. You own the project board, issue decomposition, priorities, and which engineer seat works what. You do **not** write game code, and you do **not** decide design questions — you route them to the Director with a recommended default.

**Where the project is (2026-09-04 17:05 UTC).** M0, M1 and M1.5 are closed. **M2 Basic Missions** is 47/50 and effectively done. **M2.5 Tactical Feel** is 25/27 and answers the Executive Director's first playtest in full — controls, readability, combat feedback, fog of war, per-weapon attacks, squads attacking twice. Three releases shipped today: v0.2.1, v0.2.2, v0.2.3, all live on GitHub Pages.

**What is deliberately not happening: M3.** The Director is holding it until the Executive Director plays v0.2.3 and steers, because his last round of feedback reshaped an entire milestone. Do not decompose M3. MapGen's crash-site prototype (#662) is sanctioned exploratory groundwork; the hive is not started and waits on two design answers in #447.

## The seats

Three live seats, all Opus. **eng-3** runs at max effort, **eng-4** and **eng-5** at xhigh. eng-1, eng-2 and eng-6 are stopped for good; their `seat:eng-N` labels say INACTIVE and the tooling skips them.

Assign by putting exactly one `seat:eng-N` label on a Ready issue. One open issue per seat, except where the Director says otherwise. **The tier rule was relaxed on 2026-09-04: every seat can take `complexity:high`; eng-3 is merely offered it first.** The seat label descriptions still say MEDIUM for eng-4/eng-5 — stale, and the tooling overrides it in code.

Current at 17:05: **eng-3 #424** (PR #726), **eng-4 #497** (In Progress), **eng-5 #709** (PR #729). No seat idle.

**#457 is unblocked and first in the queue.** #719 merged, #697 is closed, and #457 is `p1` in M2.5 — priority, then milestone, then tier puts it ahead of everything else Ready, so the next seat that frees takes it automatically. Do not pre-seat it; one issue per seat.

**#716 shipped without ever being seated** (PR #722). Asked on the issue which seat is on it; no answer yet. The seat map is the only thing keeping two engineers off one file, so chase this rather than letting it drift.

The eligible engineer pool behind #457 is thin — #477, #626, #673 — because M3 is embargoed and three design calls are parked. If the playtest answer is days out rather than hours, this pool runs out of substantive work before it runs out of seats.


## The tooling — read before you touch a seat

Two scripts are committed under `tools/producer/`. **`autofill.py` is not committed** — it lives only in a session scratchpad and is copied forward by hand from one Producer to the next. Mine is at `/tmp/claude-1000/-workspaces-tut/6edc8b21-3d58-4e11-b3ed-10cf5e542323/scratchpad/autofill.py`, copied from my predecessor's session. **Copy it into your own scratchpad before you arm anything**, and consider finally landing it under `tools/producer/` in a `chore(producer):` PR; one instance refresh with nobody holding a copy loses the seat loop entirely.

- **`groom.py`** — reads every issue and PR through **REST** (the shared GraphQL budget is exhausted regularly; `gh api rate_limit` lies about it, so try a call rather than trusting the endpoint) and syncs the project board's Status and Owner. Board writes are the only GraphQL it uses. Run it every tick. It writes `.producer/digest.json`.
- **`render_handoff.py`** — splices the digest into this file between the `digest:start` / `digest:end` markers. Everything outside the markers is yours to write.
- **`autofill.py`** — the seat-refill loop, run every 5 minutes by a background Monitor. For each live seat with no open seat-labelled issue it picks the best candidate and labels it, posting a `**Producer**` comment.

**Selection precedence, in order:** priority (p0→p3) → milestone (`MILESTONE_RANK`: M2.5 above M2 above the rest) → the richer tier the seat can take → issue number. Getting that order wrong cost six false starts on one issue; do not "simplify" it.

**Two control files, both git-ignored, in `.producer/`:**
- `hold.txt` — issue numbers the loop must never seat, **with the reason on the same line** once #720 merges (the parser that allows it ships in that PR; until then the file must stay bare integers, or the old parser silently empties the whole list). Currently **594, 447, 591, 685**.
- `release-allowlist.txt` — when present, the loop seats **only** from this ordered list and prints HOLD otherwise. Create it to freeze scope for a release; delete it to lift.

**The loop never auto-seats `area:art`, `area:qa` or `area:mapgen`** — those belong to the Art Director, QA and MapGen, who self-direct. When an engineer genuinely should take one, label it by hand; that is the designed escape hatch, not a workaround.

## What owes whom

| Item | Waiting on |
|---|---|
| **#450** redraw the Earth map | Art Director. Cosmetic; fine to move to Track: Arsenal. |
| **#594** mech-bay utility slot | Art Director, choosing between three options. On hold. |
| **#652** unit card at 720p | Art Director: may `range · acc · dmg · pen` be abbreviated? Three answers offered. |
| **#281 + #685** | Executive Director, from play. **One decision about one piece of ground**: #685's fix spends the density budget #281 is judging, and MapGen asked for the #281 call first. |
| **#591** | Director. **Unbundled and cheap** — three data lines, reversible, no art, does not need the playtest. MapGen's **option 2** is the recommendation of record; they withdrew option 1. |
| **#728** fog captures | Art Director, or me. 29 commits stale, and they are the frames the Executive Director looks at. I retag `area:graphics` and seat it if unclaimed by ~19:00. |
| **#716** which seat | The engineer who shipped it (PR #722). Board bookkeeping only — the tier ask is withdrawn. |
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

1. **#457 goes to the next seat that frees.** It is released from hold and ranks first; the loop will take it. Tell whoever gets it that #697 built the sheet-stepping path, so the tracer/claw/death effects need feeding, not building.
2. **Chase #728** — if the Art Director has not claimed the stale fog captures by ~19:00, retag `area:graphics` and seat it. They are what the Executive Director looks at.
3. **Get an answer on #591 specifically.** It is now separable from the playtest: three data lines, reversible, MapGen ready to build. The cheapest unblock available.
4. Get the Executive Director's playtest answer for the rest. #281+#685, #497's calibration half, and three of M3's five clusters all sit behind it — and so does the queue depth.
5. **#720 must merge or be carried forward by hand.** `autofill.py` still exists only in a session scratchpad; if this session dies before that PR lands, copy it out first.
6. Close M2 by moving #450 to Track: Arsenal and taking the #281 call, or accept 47/50 until he plays.

## Session log — 2026-09-04, successor's first tick (15:45–15:55 UTC)

- Confirmed the seat map against live labels; no seat idle, nothing re-routed.
- Pruned four closed issues out of `hold.txt`; recorded the reason for all three that remain.
- Established that **#457's hold is a file collision with PR #713, not a priority call**, and said so on the issue with an offer to fold it into #697 if the Art Director would rather do both in one pass.
- Labelled the nine issues filed since the last tick that had no priority (#591 #673 #685 #694 #697 #709 #712 #714 #716), and gave #591 #685 #694 #709 #716 the `area:*` / `type:*` labels they were missing.
- Re-tagged **#673** from `area:ui` to `area:art`: it is four icons *asked of* the Art Director, and under `area:ui` my loop would have cheerfully seated an engineer on drawing them.
- Asked the Tech Lead to tier #716.
- Re-armed both loops (they die with the session): the 5-minute Monitor and a 15-minute grooming cron.

## Session log — the rest of the day (15:55–17:05 UTC)

**16:00 main went red and came back.** #701 (palm clustering) lost a difficulty-4 mission and
was reverted in #723. **Reopened #701** — the board said Done for a change no longer in the
tree, and the Tech Lead wants it re-landed. Closed **#725** as a duplicate of **#721**: two
engineers bisected the same red independently, six minutes apart. Routed the durable finding
to #497 — a pure prop-placement change flipped a d4 mission, so that band is one map change
from a loss.

**16:24 #711.** The author had loosened `WALKOVER_CEILING` to a floor of 20/24; the #701
evidence showed that floor would have swallowed the regression. I supplied the board datum —
the red cost an engineer-hour twice over through duplicate triage — and argued that is a
filing problem, not an argument for a looser gate. He re-ran it and set 24/24 himself.

**16:35 #497.** eng-4 had paused, unsure the issue was still theirs after my predecessor's
14:23/14:38 unseat-reseat churn. Answered immediately, and stated the standing rule: **a seat
label is an assignment, not a proposal.** Also drew the scope line their finding needed — *a
dial that does nothing is a defect, not a taste call* — so the responsiveness fix proceeds
now while the values that set felt difficulty stay parked. Tech Lead invited to veto.

**17:00** #719 merged, #697 closed, #457 released from hold.

## The trap I fell into, so you do not

**#591 and #685 carry `design-decision:` in their TITLES and did not carry the LABEL.** The
loop skips the label. Both were eligible all along; they surfaced only when I gave #591 a
priority and a `type:task` while tidying the board, which lifted it into the ranking. eng-5's
seat freed, the loop took it, and it seated an engineer on a question I had said nineteen
minutes earlier was blocked on the Executive Director. Caught before any work started.

I had also asserted, in my own words that day, that both were "design-decision labelled, so
my loop skips them". I read the titles and never checked the labels. **Check the label.**
Same class as the inert start-comment guard my predecessor found: a belief about a guard is
not the guard.

Fixed three ways — the real label on both, both on the hold list, the reason on the issue.
**Tooling follow-up:** have `autofill.py` warn when a title starts with `design-decision:`
and the label is absent.

## Corrections I had to make

MapGen revised their measurements and I quoted their first table on #281. Three claims wrong:

1. The **87–89 %** rural visibility is stale. #645 and #677 landed; rural is **68–72 %**. The
   sight-rule fix bought ~20 points of concealment by itself.
2. I recommended **#591 option 1 after its author had withdrawn it**. The prop pass already
   clusters 82–100 % of trees, so options 1 and 2 differ by 0–2 points, and option 1 does
   nothing in the desert, where 0 % of trees are clustered.
3. **#591 does not belong in the #281 bundle** — it changes no placement, so it does not
   spend the density budget. Unbundled.

The lesson, which cost me two wrong comments in twenty minutes: **a measurement in an issue
body is a snapshot, and the fixes that land during the day move it.** Read the newest comment
before quoting the original table.

## Carry to the Director

- **The difficulty dial stops responding at 4.** eng-4 established by arithmetic, not
  sampling, that **d7–d10 are byte-identical missions**: `minWaveInterval: 2` floors at d4,
  `maxWaveSize: 8` caps the first wave at d7, and `hatchInterval`/`hatchCount` carry no
  difficulty term at all. Three taps fill the board; one ignores its handle entirely and two
  are shut against their stops across the top two thirds of the range.
- **The gradient above d5 was sampling noise.** Played paired — the same six maps at all ten
  difficulties — the cliff at 5 is sharp and the top half is flat (2/6 2/6 2/6 2/6 1/6 1/6).
- **Ambush is impossible today** (#685: 0 % of contact tiles are ever unseen), and PR #722
  merged the lurker's memory of where it last saw you. We now have memory for a stalker with
  nowhere to stalk. #685 is what fixes that.
