# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-06 08:02 UTC)

**Production ON HOLD** (#748). The Executive Director tunes Map Lab; only his named exceptions proceed. No M3 decomposition or Ready growth beyond those exceptions. **v0.2.8** is tagged; general production has not resumed.

**Producer:** Codex, Astra 6 / high. Standing rule (#820): one background watcher, GitHub every 5 minutes, exit on first merged PR/new issue/seat-label change/Producer comment; groom and re-arm. Hard timeout after 3 hours, report once and stop. No cron or concurrent watcher.

| Engineer seat | Runtime / effort | Tier | Assignment |
|---|---|---|---|
| eng-3 | Codex, Astra 6 / xhigh | high only | **#842 In Review** — PR #843, lurker sweep fixture |
| eng-4 | Claude Opus 5 / max | low / medium only | Idle; #828 Done via #835 |
| eng-5 | Claude Opus 5 / max | low / medium only | Idle |

**Milestones** (closed / total, 04:09 UTC API snapshot): M0 14/14 · M1 64/64 · M1.5 33/34 · M2 48/50 · M2.5 25/27 · M3 1/2 (held). Counts do not declare milestone completion.

**Completed / board:** half-height engine, generator, real slope kit and ramp-gap fix (#807/#808/#809/#817) Done. **#828/#835 camera zoom Done**; both screens frame the map and zoom in to a readable squad. Producer handoff #841 and QA catalogue #839 merged and Done.

**Scale exception (#826):** parent In Progress; ADR 0009 merged and camera prerequisite #835 satisfied. **#829 / PR #838 Blocked, MapGen-owned**: Director accepted the frames and approved all three rulings, applied in c48ae4b. Remaining blockers are the CI generation-sweep timeout at 120 seconds and three tactical e2e failures on rescaled harness maps. MapGen fixes and runs the local CI gate; Tech Lead re-gates the merge result and merges on green. **Next release waits for #840**, by Director ruling.

**AI follow-up #842 / PR #843:** **In Review, eng-3 / complexity:high**; Director-approved scale follow-up, content approved by Tech Lead. Awaiting CI and merge-result gate; **lands before #838**, which must retain the enabled fixture when merging main and remove its temporary skip. The explicit cover fixture keeps the behavioural assertion; a rear-preference mutation fails it. The old sweep's low attack count is recorded on #497 as a harness finding, not proof of a balance defect. This remains the only open eng-3 issue.

**Road-kit child #840:** **In Progress, Art Director**, in parallel with #838 gate fixes. MapGen identified the kit limitation that authorizes this child: lane-interior slab, kerb edge and centre-line pieces so wide avenues stop reading as parallel single-lane roads. No engineer seat label.

**Ramp audit #813:** **In Review, QA**; catalogue **#839 merged / Done**, while the defect remains open for fix scope and judgment. QA separates J1 consecutive diagonal corners (geometry), J2 unwalled lot/border exclusions (placement, largest area), and J3 three-sided shapes (needs judgment); narrow-channel battlements are not a missing-piece defect. Scope fixes from this catalogue and obtain Director frame judgment before merge; rerun the audit after #829 changes scale.

**Other open PRs:** #757/#694 mech-bay preview remains In Review under the Director's exception, content approved, awaiting final merge/frame gates. Existing Art Director ownership retained; route an author update only if the gate requires one. Producer handoff #841 merged; this pass opens its successor.

**Blocked / parked:** #838's generation-sweep timeout and three tactical e2e failures; #813's fix scope and J3 judgment; next release on road art #840. General production and M3 held; #787 parked; #793 p3. eng-4/eng-5 idle; the last Ready-high audit found only held M3 #447.

**Risks:** green CI and merge-result gates remain required. #843 lands first; #838 must keep its enabled lurker fixture and remove the temporary skip; scale's recorded walkover baseline shift is on #734, with balance retuning out of scope. #840 must integrate with #838's resolver; QA's ramp findings must be rechecked on the new scale. Inherited autofill still permits the wrong tiers; do not run it.

**Next routing:** a Ready, unowned high-complexity engineer issue within an Executive Director exception goes to free eng-3; low/medium stay on Opus. Preserve specialist ownership and one open issue per seat. Record the exception and cleared prerequisites before labeling. Groom the next event, then re-arm one watch.
<!-- digest:end -->


## Current watch operation (2026-09-06)

The session watcher is `.producer/watch.py` (git-ignored workspace scratch), running in a background terminal. It is read-only and uses a process lock to enforce one watcher. `watch-state.json` keeps the cursor and poll time across re-arms; `watch-result.json` caches the event payload for grooming. The four event classes and self-comment exclusion passed `--selftest`. It never assigns seats or runs the inherited autofill/groom scripts. On API errors it exits visibly rather than retrying rapidly. These session files are not guaranteed to survive a replacement checkout; reconstruct this bounded watch if absent, following the standing rule above. Keep tooling changes out of handoff PRs.


> **Historical predecessor notes (2026-09-04–05).** Preserved for context only. The current Status Digest and the Director's instructions supersede all old assignments, tier rules, next steps, and directions to re-arm monitors or crons below. The digest was refreshed manually for this bounded Codex pass.

## Read this first

You are the Producer for Terra Under Threat. You own the project board, issue decomposition, priorities, and which engineer seat works what. You do **not** write game code, and you do **not** decide design questions — you route them to the Director with a recommended default.

**Where the project is (2026-09-04 17:50 UTC).** M0, M1 and M1.5 are closed. **M2 Basic Missions** is 47/50 and effectively done. **M2.5 Tactical Feel** is 25/27 and answers the Executive Director's first playtest in full — controls, readability, combat feedback, fog of war, per-weapon attacks, squads attacking twice. Three releases shipped today: v0.2.1, v0.2.2, v0.2.3, all live on GitHub Pages.

**What is deliberately not happening: M3.** The Director is holding it until the Executive Director plays v0.2.3 and steers, because his last round of feedback reshaped an entire milestone. Do not decompose M3. MapGen's crash-site prototype (#662) is sanctioned exploratory groundwork; the hive is not started and waits on two design answers in #447.

## The seats

Three live seats, all Opus. **eng-3** runs at max effort, **eng-4** and **eng-5** at xhigh. eng-1, eng-2 and eng-6 are stopped for good; their `seat:eng-N` labels say INACTIVE and the tooling skips them.

Assign by putting exactly one `seat:eng-N` label on a Ready issue. One open issue per seat, except where the Director says otherwise. **The tier rule was relaxed on 2026-09-04: every seat can take `complexity:high`; eng-3 is merely offered it first.** The seat label descriptions still say MEDIUM for eng-4/eng-5 — stale, and the tooling overrides it in code.

Current at 17:50: **eng-3 #457** (VFX playback, the last non-epic M2.5 item), **eng-4 #497** (difficulty responsiveness), **eng-5 #626**. No seat idle.

**The queue emptied at 17:35 and refilled by itself at 17:37.** For two minutes there was not one unheld, tiered, engineer-takeable issue on the board; then the Tech Lead filed #739, #740 and #743. Do not read that as a solved problem — it was solved by someone happening to file, not by anything structural. The held set is large and legitimate: M3 embargoed, #281/#591/#685/#734 on the Executive Director, #594 on an Art Director choice.

**When it empties again, the honest move is to let a seat idle.** I told the Tech Lead so in writing on #737: sizing work he has not looked at, to fill a queue, is worse than a gap. Do not lift a hold to make work, and do not file filler — #735 was filed with an explicit "close this if you do not want it" for exactly that reason.

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
| **#728** fog captures | **Tech Lead, for a tier.** Retagged `area:graphics` at 17:37 when no claim came; still unseatable without `complexity:*`. Art Director gets it back on request. |
| **#734** difficulty calibration | Executive Director. The taste half of #497, split out so it is separately claimable. Untiered on purpose; ask for a tier when the block lifts. |
| **#735** guard audit | **Tech Lead: tier it or close it.** Filed from their own finding; deliberately untiered so I cannot seat it. An idle seat beats unwanted work. |
| **#743** extraction hook | **Tech Lead, a routing question.** They tiered it (engineer signal) but it lives in `src/mapgen/`, which `studio.md` gives MapGen end to end. Labelled `area:mapgen` as the reversible choice. |
| **#740** debrief reward | Art Director gets first refusal — they raised it and offered. Currently labelled for an engineer. |
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

1. **#457 is the last non-epic M2.5 item.** When it merges the milestone is down to epic #514, and closing a milestone is the Director's call — flag it rather than closing it yourself.
2. **Chase three tiers**: #737→#739 is done, but **#728** and **#735** still need `complexity:*` from the Tech Lead, and #743 needs the routing answer. Untiered work is invisible to the loop.
3. **#591 is the cheapest open design call** — three data lines, MapGen's option 2, reversible, and it does *not* need the playtest. Get an answer on it separately from the #281+#685 bundle.
4. Get the Executive Director's playtest steer for the rest: #281+#685, #734, and three of M3's five clusters.
5. Close M2 by moving #450 to Track: Arsenal and taking the #281 call, or accept 47/50 until he plays.

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

## Session log — 17:05–17:50 UTC

**Split #497 on the Tech Lead's prescription.** His diagnosis on #731: *"an issue with
separable halves gets taken twice because the halves are not separately claimable — #652 was
card + shortcut, #497 was measurement + tuning."* I had drawn exactly that line on #497 in a
**comment** and thought it sufficed; it left the parked half invisible on the board but still
inside a seated issue. The calibration half is now **#734**, held, with the day's settled
findings copied onto it. **A scope line in a comment is not a claim boundary.**

**#720 merged**, so `autofill.py` is in the repo and the monitor now runs the repo copy. There
is no scratchpad copy to keep in sync any more. Diffed the merged file against mine (identical)
and ran `--selftest` against it before repointing.

**Filed #735** (audit for guards that cannot fire) from the Tech Lead's own finding that two
guards in my tooling had never once reported anything. Deliberately **untiered**, with an
explicit "say no and I will close it" — filing work to fill a queue is worse than an idle seat.

**#728 retagged `area:graphics`** at the deadline I had announced, no claim having come in.
Still needs a tier to be seatable.

## The duplicate I was half of

The Tech Lead and I both read PR #736 and both filed its two findings — **64 seconds apart**.
Mine #737/#738, theirs #739/#740. I closed mine: theirs carry `complexity:*` labels I cannot
add, and being first is not a claim.

That is the **seventh duplicate pair today** (#566/#569, #462/#460, #190/#191, #664/#684,
#688/#691, #721/#725, this). Searching does not prevent this shape — neither issue existed
when the other was written, same as #721/#725 this morning.

**The protocol that would: when filing from someone else's PR or issue note, comment on the
source first saying you are filing it.** Sixty seconds of visibility is the whole fix. I have
said so on #736 and #737 and I am doing it that way from now on.

Carry the routing when you close your own duplicate. #738 had a decision in it — the reward
emphasis belongs to the Art Director, who raised it and offered — and #740 does not, so I put
it on #740 explicitly rather than letting it die with the closed issue.

## Session log — 2026-09-05, the hold (Fable 5.1 seat)

- Executed the Producer side of #748: monitor and cron stopped, empty release allowlist written (freeze), shutdown report posted on #748, stop-safely notes on #457 and #739.
- Read PR #763: strict model tiers. eng-3 is Fable and takes `complexity:high` only; eng-4/eng-5 are Opus and take low/medium only; high queues behind eng-3 and never drops to Opus. An idle Fable seat is correct. Recorded in memory and above.
- Watched #748 to close without a resume order. Did not lift the freeze on the Director's closing comment: closing the issue is not the Executive Director instructing a resume.
- Seated #786 on eng-4 as an Executive Director exception. Touched no other seat.
- Monitor (not a timer) watches #748 comments, Producer mentions, and new Executive Director issues without an agent header, every 5 min over REST.

**At resume:** fix autofill tiers per #763 (`chore(producer)` PR), delete the empty allowlist, re-arm monitor + 15-min cron, post resume notes on #457/#739 as promised, groom, refresh this digest.
