# Studio Process

How work moves through the Terra Under Threat project. Every agent reads this before starting.

## 1. Roles

| Role | Lifespan | Owns |
|---|---|---|
| **Executive Director** (human) | — | Vision, milestones, taste decisions |
| **Director** (Claude, outside fleet) | — | Design doc, architecture sign-off, staffing, priorities. Never reads code. |
| **Tech Lead** | long-lived | Reviews and merges every PR. CI, engine architecture, ADRs, conventions. Sole merge authority. |
| **Producer** | long-lived | Project board, issue decomposition, dependency tracking, **assigning issues to engineer seats**, status digest, stale PR chasing |
| **Engineer** | long-lived seat (`eng-1`…`eng-6`) | Works the one issue labeled `seat:<seat>`, opens a PR, addresses review, then pulls the next |
| **Map Generation Specialist** | long-lived | Owns `mapgen/` end to end |
| **Art Director** | long-lived | Models, textures, generated images, VFX, style guide |
| **QA** | periodic | Headless runs, smoke tests, bug reports |

Role briefs live in `docs/process/roles/`. Handoff notes live in `docs/handoff/`.

**Staffing (Executive Director, 2026-09-06).** Each seat runs on a fixed model and effort; the Director launches every session with those set explicitly.

| Seat | Runtime | Effort | Notes |
|---|---|---|---|
| Director | Claude Fable 5.1 | xhigh | managed directly by the Executive Director |
| Tech Lead | Claude Fable 5.1 | high | |
| Producer | Codex, Astra 6 | high | waits on one bounded watch loop (background terminal) |
| MapGen | Codex, Astra 6 | xhigh | `area:mapgen` only, idles otherwise |
| Art Director | Codex, Astra 6 | xhigh | |
| QA | Claude Opus 5 | max | |
| eng-3 (the high seat) | Codex, Astra 6 | xhigh | `complexity:high` only |
| eng-4, eng-5 (the Opus seats) | Claude Opus 5 | max | `complexity:low` and `complexity:medium` only |

Codex seats have no Monitor tool but do have background terminals. When a Codex seat would otherwise stop and wait, it runs **one bounded watch loop** as a background terminal: poll GitHub every 5 minutes, print one line and exit on the first relevant change, hard stop after about three hours. It acts on what the loop reports and repeats. If the loop times out with nothing, the seat ends its turn and the Director prompts it. Claude seats wait on one event monitor (§3). Either way: one watcher per seat, no crons, no busy loops, and the Director is never the only path for an event to reach a seat.

## 2. Work item lifecycle

```
  Backlog ──► Ready ──► In Progress ──► In Review ──► Done
                 ▲            │              │
                 └── Blocked ◄┴──────────────┘
```

1. **Issue.** Every unit of work is a GitHub issue with a milestone, one `area:*` label, one `type:*` label, and a `p0`–`p3` priority. Epics (`type:epic`) list child issues as a task list.
2. **Ready** means: acceptance criteria written, dependencies merged, no open design question.
   **Assignment**: the Producer labels a Ready issue `seat:eng-N`; that seat's engineer picks it up. Management is layered: the Director manages the Producer, Tech Lead, and Art Director; the Producer (with Tech Lead input) manages engineer assignments; the Director only sizes the engineer pool.
   **Complexity tiers**: `complexity:low|medium|high` describes scope and guides normal routing. There is no pre-start Tech Lead sizing gate; explicit Director routing takes precedence over historical tier labels. If work is bigger than expected, the engineer reports evidence in the issue for Director re-scoping. Engineer seats run on different models and effort levels (recorded in each `seat:eng-N` label description), and the tiers are strict in both directions: `complexity:high` goes only to the high seat (`eng-3`) and queues behind it; low and medium go only to the Opus seats. A seat with no work in its tier idles rather than reaching across. This keeps the hardest problems with the most capable agent and keeps that agent's budget for them.
3. **Branch.** `<type>/<issue-number>-<short-slug>`, e.g. `feat/42-infestation-tick`. Branch from `main`.
4. **PR.** Title `<type>(<area>): <summary> (#<issue>)`. Body follows the template. Link the issue with `Closes #N`. Keep PRs under ~500 changed lines where possible; split otherwise.
5. **Review.** Tech Lead reviews. Engineers address comments on the same branch. Tech Lead merges with squash when CI is green and the PR is approved.
6. **Done** when merged. The producer moves the card; engineers may also move it.

## 3. Rules for every agent

- **Never push to `main`.** Never force-push a branch you don't own. Never rewrite history on `main`.
- **Never touch another repository.** This project is `BenjaminBenetti/tut` only.
- **Every change is a PR.** Docs included.
- **Don't block on art.** Use placeholders.
- **Don't block on questions.** If an issue is ambiguous, make a reasonable call, state the assumption in the PR, and label the issue `design-decision` if it needs the Director.
- **Keep your handoff current.** Long-lived roles update `docs/handoff/<role>.md` at least every few hours of work and before finishing. Short-lived roles put their state in the PR description.
- **Comment header.** Every GitHub comment an agent posts starts with `**<Role>** · TUT agent` on its own line so humans can tell who said what.
- **Conventions are enforced.** SOLID, `/<domain>/<type>/<file>`, doc comments on every method, section comments. See `CLAUDE.md`.
- **CI must be green.** Red CI is the author's problem, not the reviewer's.
- **No timer-driven wake-ups.** A scheduled prompt or cron that wakes an agent re-sends its entire context every time it fires. The Tech Lead session retired on 2026-09-05 ran a 4-minute review cron 223 times at about 2.7M tokens each, most of the studio's usage that day. Wait on events instead: one background monitor, a shell loop that polls GitHub at most every 5 minutes and prints only on change, so the model wakes only when there is something to do. Compact when context passes about 150k.
- **A green suite is not a working screen.** If a change alters anything the player sees, render it and look at it before you call it done, and commit the render. Three seats found this the hard way on 2026-09-04 and it now has a name:
  - features that **ship working and invisible** — every overlay failing a depth test (#555), the 2 AP band painted over (#572), a selection ring built and never drawn (#605), all with CI green;
  - rules that are **correct and unseeable** — the sight overlay fed on `mission.units`, so it never marked a tile for seeing an *objective* (#517);
  - checks that **measure the wrong thing and pass** — the faction read test run on the one ground where TDF read best, clearing a faction that vanishes on grass (#613).

  Each was a green suite over a broken screen, because unit tests assert that a piece behaves and nothing asks whether the picture is right. Rendering the real thing is the only defence anyone here has found.

## 4. Communication

**Anything that matters goes on GitHub.** The terminal is for starting or resuming a CLI; a message in its composer can remain unsubmitted while looking sent. Do not rely on it to deliver direction.

- Work-scoped direction, claims, questions, review and evidence belong in the relevant issue or PR thread.
- Cross-cutting rulings, process changes and status affecting multiple seats belong in [Discussion #968: Studio standing orders](https://github.com/BenjaminBenetti/tut/discussions/968). Every comment there is addressed to every seat.
- Read the discussion at startup and after a refresh. Add it to the **existing** event watch, including when waiting for work or review. Keep one watcher, poll at most every five minutes, and retain the bounded terminal's three-hour deadline. Do not add a separate loop or cron.
- Poll using the Director's query:

```sh
gh api graphql -f query='{repository(owner:"BenjaminBenetti",name:"tut"){discussion(number:968){comments(last:10){nodes{createdAt body}}}}}'
```

Remember which comments have been read; a new comment is relevant even without a role mention. **Sample every watched channel once per five-minute cycle before deciding to exit.** Collect discussion, issue/PR and other relevant changes into the same report; a discussion event must not short-circuit work-thread checks. Read all reported direction before re-arming. This prevents a busy standing-orders thread from delaying issue instructions across several polls, as [eng-3 reported on #996](https://github.com/BenjaminBenetti/tut/issues/996#issuecomment-5592623363). The query returns only the latest ten comments: on restart or if more may have arrived, page through the discussion to catch up before advancing the cursor. The Producer watch also detects edits and replies so an update does not disappear behind a timestamp-only cursor.

Use the normal `**<Role>** · TUT agent` comment header in discussions too. If your queue is empty, say so in your last work thread or the standing-orders discussion before waiting; an idle seat must be visible. Map design questions go to the Map Critic and MapGen; escalate a conflict with an Executive Director ruling in its work thread.

**Standing orders at the 8 September restart:** the production hold is lifted; Blocked requires a real dependency. The Map Critic → MapGen → Art loop does not consume engineer seats. GitHub Assignees identify only the Executive Director; `seat:` labels claim work, and an issue without one is unowned. Board Owner still records the responsible role. The existing specialist seats use `seat:mapgen` and `seat:art-director`; they do not consume engineer slots. Named QA work uses `seat:qa`, and Producer coordination uses `seat:producer`, both existing roles. Keep `area:*` labels for intake/domain, the primary `seat:*` claim for ownership, and board Owner for the responsible role. Cross-domain issues may have both areas but one primary seat claim. Queued ownership and completed work in review do not imply a second active job. Read the discussion for subsequent rulings rather than treating this snapshot as permanent.

**Current focus (Executive Director, 8 September): tactical UX and map generation, made robust.** [The verbatim ruling](https://github.com/BenjaminBenetti/tut/discussions/968#discussioncomment-18358444) keeps the existing squad-reveal, layer-control and real-place map rulings. Sequence in-focus work before outside work on each seat. Outside work is retained and yields; if a seat's entire remaining queue is outside the focus, flag it to the Director for an in-focus assignment. Preserve completed work in review rather than moving it back to queued implementation. `focus:deferred` records the scheduling distinction; it is not a dependency or cancellation. Newly encountered defects still get filed the day they are found, in any area. Do not expand M3 or fill queues speculatively against this focus.

**Temporary merge pause (Director, [8–9 September](https://github.com/BenjaminBenetti/tut/discussions/968#discussioncomment-18358544)):** the Tech Lead reached the reported Fable weekly limit. This is not a production hold: keep working, take the next queued in-focus issue when implementation reaches review, and push checkpoints before finishing even when incomplete. Publish evidence if Director judgment is unavailable. Do not switch models or retool seats, redo accepted work, or park waiting for a merge. The Tech Lead remains the sole merge authority; completed work stays in review until that gate resumes.

## 5. Status digest (Producer)

The Producer keeps `docs/handoff/producer.md` current with, at the top, a **Status Digest** section:

- Milestone progress (issues done / total per milestone)
- In-flight PRs and their age
- Blocked items and why
- Recommended next assignments for idle engineers
- Risks

The Director reads this every tick. Keep it under one screen.

## 6. Handoff protocol

When a long-lived agent is refreshed, its replacement starts by reading `docs/handoff/<role>.md`. A good handoff has:

1. What I was doing and where it stands
2. Open PRs / issues I own
3. Decisions I made and why
4. Things I'd do next, in order
5. Gotchas

Handoff files are committed via PR like everything else, titled `chore(handoff): <role> <date>`. The Tech Lead fast-tracks these.

## 7. Visual evidence and regression baselines

Accepted PR frames are a dated record of the tested code and capture recipe. Record the base and runtime revision, the evidence commit or PR head, seed/fixture, camera/settings and command so the record can be interpreted and reproduced. A rerun on newer main is a new measurement: keep it separate from the accepted record rather than silently replacing judged PNGs to follow unrelated rendering changes. A cross-version difference alone neither invalidates the original conclusion nor establishes the cause of the difference.

A committed image that an executable test actually compares against is a regression baseline. The test owner updates it through a reviewed change, explaining intentional differences and supplying the appropriate before/after/control evidence. Do not refresh baselines merely to make a failing check pass. Tech Lead reviews the change; Director judges visual changes where required by the work's acceptance.

A same-run control tests the relationship its spec names. It must still establish repeatability, include the relevant fixture case and be able to expose the claimed defect; a historical PNG elsewhere is not implicitly part of that assertion. State whether an image is an acceptance record, an asserted baseline, or both. The [discussion on accepted frame drift](https://github.com/BenjaminBenetti/tut/discussions/968#discussioncomment-18358355) records the distinction; an attributed rendering cause remains an inference until isolated.
