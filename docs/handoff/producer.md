# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-09 05:20 UTC)

**Checkpoint and pause: 06:00 UTC today.** The Director corrected the earlier local-time wording: the studio runs in UTC. Push work and leave a resume checkpoint before 06:00; then **CLIs exit and messaging stops** until the studio resumes. [Recorded standing order](https://github.com/BenjaminBenetti/tut/discussions/968#discussioncomment-18361823). Tactical UX and robust map generation remain the focus until the cutoff.

**Main / release:** snapshot main **5c6fb11**; latest published release **v0.2.16**. **21/22** original sweep PRs have merged; only #1051 remains. Generated dropship placement #1042, squad identity #1047 and the remaining command-refusal path #1066 are now on main. The old pending gate on cd37ce9 is superseded by the Tech Lead's later full gates and release authorization; current CI exceptions are listed below.

| Seat | Active / queued / review |
|---|---|
| eng-3 · Astra 6/xhigh | #1069 remains active for post-rebuild iGPU probes; implementation #1078 merged and the seat has pushed its rebuild checkpoint. #869 is Done |
| eng-4 · Opus 5/max | Two submitted pairs: #1029/#1051 and #1062/#1067. Author rebases/review remain; no new issue assigned in this pass |
| eng-5 · Opus 5/max | **#1091 Ready / assigned**, next implementation; one existing submitted pair #1072/#1077. Pickup not yet observed at this snapshot |
| MapGen · Astra 6/xhigh | #1089 p1 scout/render synchronization repair has a cause and implementation plan; #960/#1075 draft integration remains, #1082 Lagos is claimed next variety work, then #591 |
| Art · Astra 6/xhigh | #1005 water repair and #1060 bench support merged; no whole active issue claim beyond deferred #450. #1082 has an Art cause/boundary proposal; a bounded asset contribution still needs routing |
| QA / Critic | QA verifies v0.2.16 and subsequent main, supporting #1089. Critic's variety ranking is Lagos #1082 → Perth #1083 → Johannesburg #1084 under #1068; #960 remains partial |

**#1091 routing:** eng-5 had **one** open issue/PR pair versus eng-4's **two**, so receives the regular-p2 camera/Attack collision. Remove A → Attack, retain F and the number row, audit W/S/D/Q/E/arrows for other camera collisions and fix the key-map comment. Prove spent-unit pan-left moves the camera without arming an action or producing a refusal. The issue has `seat:eng-5`, Owner Engineer and M2.5 Tactical Feel; **06:00 UTC is a checkpoint deadline, not a promise to finish or merge**. [Routing record](https://github.com/BenjaminBenetti/tut/issues/1091#issuecomment-5596199916).

**Unowned (no seat):** #447, #673, #701, #712, #734, #760, #787, #1068, #1073, #1083, #1084, #1085, #1092 — **13 of 24 open issues** after routing #1091. Area and board Owner do not count as seat claims. **Real blocks:** #447 hive decisions; #760 behind #447; #734 Executive Director difficulty targets, also deferred. No account assignees are added.

**Risks / remaining queue:** Tech Lead's stated merge sequence is #1051 → #1077 → #1067 once rebased; #1075 remains draft. #1090 prevents successive main pushes cancelling CI. #1089 is the known runner-only spawner-scout failure; MapGen's trace shows saved exploration succeeds while rendering lags, so QA's longer-distance hypothesis is not the established failure cause. Keep that distinction and disclose any CI exception in merge records. Stop work and watches by 06:00.

**Board reconciliation:** moved 19 closed issue/PR cards to Done, added 15 missing current cards, and filled seven missing milestones plus #1091/#1092's milestones. Review attribution is retained. The older milestone counts and seat map in #1059 are dated snapshots, not current queue instructions.

**Executive Director:** “So I think things are going well. Just keep at it.”
<!-- digest:end -->

## Checkpoint and delivery detail

**Release boundary:** [v0.2.16](https://github.com/BenjaminBenetti/tut/releases/tag/v0.2.16) was published at 03:39:41 UTC. The Director verified its deployed bundle and named the squad strip, refusal wording and pointer removal among its delivered changes. Dropship placement was explicitly excluded from that tag and has since merged. Do not describe every later main change as released. The initial 22-PR sweep remains one PR short while #1051 is open; the Director's final post-sweep digest still needs that outcome.

**Recent completions:** #869/#1063 preserves pass order and clears only the exact crossed half-wall under MapGen approval. #1005/#1064 repairs the water grid; #1030/#1044 delivers the accepted refusal notices, with remaining action-consistency work separated into #1062/#1067. #1035/#1066 now carries the typed cause through the command boundary; #1040/#1047 supplies roster identity. QA verified those last two on main dc8b1b0. #911/#1042 has merged and its four-arrival-frame refresh was delivered in #1087. #960 stays open for yard arrangements: neither its frontage kit nor the bench alone closes it.

**#960 checkpoint:** #1075's older integrated evidence remains dated; current checkpoint 52aacf0 incorporates dropships and yard provenance. Its new 108-map comparison against main 6967394 preserves the non-target records and all 36 rural maps. Current cover-adjacency cost is −1.05 percentage points in towns and −2.85 in cities; final wide/sim/browser/frame checks on that combination were still in progress in the PR body. Do not substitute the older green integration for this head's unfinished proof.

**Idle/queued work:** Art's #1082 boundary proposal identifies geographic recipe selection plus a bounded vegetation kit, while preserving global tree controls; it is not a claim on the whole issue. Flag the free Art implementation slot to the Director rather than defaulting to deferred #450. Unclaimed #1073 is the p3 Tab-centering follow-up; #1091's p2 collision goes first on eng-5. New #1092 is the separately filed capture-timeout follow-up, Ready and unclaimed; #1069 remains eng-3's active assignment. No competing implementation is assigned before its hardware checkpoint. No speculative milestone decomposition is needed before shutdown.

**Producer checkpoint:** this session routes #1091, reconciles the board, publishes this handoff and caps the existing singleton watcher at **2026-09-09T06:00:00Z** using `.producer/pause-deadline.json`. Do not remove that deadline or rearm after it until an explicit studio resume. The watcher self-tests pass; scratch tooling stays out of the PR. On resume, read Discussion #968 and issue/PR threads before using this dated queue.

## Restart audit and owner ledger (2026-09-08)

The restart audit compared all open issues and 453 starting project cards against main and release tags. Merged handoff #944 was outside Done and was corrected. Subsequent deliveries completed #753, #937, #457, the original #514 epic, and #950; new tickets are reflected in the digest above. The accepted audit [#902](https://github.com/BenjaminBenetti/tut/issues/902#issuecomment-5561213567) remains resolved.

**Director corrections govern this record.** The hold ended at restart. GitHub account assignments were removed; ownership is a `seat:` label, with board Owner retained as the responsible role. The Director routed #961 directly to eng-5 with no sizing prerequisite. [Correction 5590197490](https://github.com/BenjaminBenetti/tut/issues/950#issuecomment-5590197490) establishes that #950 was finished and In Review, not queued behind #961; #962 has since merged. Retain its seat attribution. Check the open PR list before moving work backwards. Completed work in review does not compete for the active slot. Older process text requiring a pre-start tier or only one non-Done label is superseded by these explicit instructions.

Current ownership, queued work and review dependencies are recorded above. The former restart table is removed because its changing rows contradicted the live digest; Git history preserves that dated audit.

**Retained completion record:** #937→#943; #917→#973; #945→#1007; #959→#1016; #457→#955; #753→#948; #949→#989; #991→#998; #992→#994; #950→#962; #961→#977; #978→#999; #996→#1013; #594→#1002; #751→#972. #514 closed after all sixteen children were verified closed. Later completions and evidence limits are in the sweep ledger above.

**Layer vocabulary:** #961 resolved the ADR 0008 fork: one storey is **two engine layers** (`STOREY_LAYERS=2`). Subsequent tickets must distinguish storeys from layers. The hillside limit was separate #978 work.

**Queued specialist work:** #591 remains MapGen's current-scale tree-opacity assessment after live repairs, separate from the Executive Director's ambush ruling. Unclaimed #701 is the palm-clustering follow-up, #712 needs a recorded temperate-boulder decision, and #787 awaits a future M3/Executive Director overpass brief. #450 and #673 are deferred art work. #1014/#1022 difficulty measurement preparation and #740/#1020 payout treatment have merged; #734 still needs Executive Director targets and is deferred.

**Scope correction:** PR #948 distinguishes StartMission from FinishMission and reports live/reload render proof; the old #753 migration premise was incorrect according to that evidence. Tech Lead accepted it in merged #948.

**Evidence limits.** The 1.6-unit VFX heuristic is gone through #955; the separate kerb/connectivity repair hazard has now been repaired through #1063. QA #974 measured the old parapet-crossing population at zero after platform removal; eng-3 completed the distinct surviving repair hazard in #869 with MapGen approval. Main now has radius 4 / opacity 0.175 through #943; cursor-driven reveal #947 shipped through #982 in v0.2.14 and is now removed by #1032; squad reveal remains. The Critic's post-#936 height verdict is bounded to the inspected infantry-accessible blocks; it does not erase MapGen's measured loss of mech-accessible outdoor height. This pass changes process records only, not game code or visual acceptance. Historical measurements remain attributed to the revision that produced them.

## Current watch operation (2026-09-09)

[Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968) is the standing-orders channel: all comments are relevant to every seat. Work-scoped direction stays in issue/PR threads; the terminal starts or resumes the CLI. The studio process and every role brief now carry the channel.

The session watcher is `.producer/watch.py` (git-ignored workspace scratch). The earlier terminal exited on a change; re-arm only before the explicit 06:00 UTC studio cutoff. It is read-only and uses a process lock to enforce one watcher. `watch-state.json` keeps the cursor and poll time across re-arms; `watch-result.json` caches the event payload for grooming. The original four event classes plus discussion comments/edits/replies and self-comment exclusion passed `--selftest`; a paginated catch-up check retained older comments and reply continuation. Discussion polling extends the Director’s last-ten-comments GraphQL query with identity, edit and reply fields. All comment pages are read so bursts and edits are not lost. The live query passed. It remains one five-minute poller with a three-hour deadline. It never assigns seats or runs the inherited autofill/groom scripts. On API errors it exits visibly rather than retrying rapidly. These session files are not guaranteed to survive a replacement checkout; reconstruct this bounded watch if absent, following the standing rule above. Keep tooling changes out of handoff PRs.

**Milestone counting:** derive progress from the paginated issue records, explicitly excluding PRs, and reconcile the open counts with the open-issue list. On this pass the milestone API counters underreported M3 (one open versus three listed) and Tech Debt (one versus two); its other totals also include milestone-linked PRs. Do not reuse those cached counters as issue progress. Scratch evidence: `.producer/audit-2026-09-08/all-issue-states.json`; rebuild it from `gh api --paginate` if the scratch checkout is absent.

**Publication cadence:** normally push a handoff PR once and leave its head fixed until CI finishes and Tech Lead merges it. Batch subsequent digest changes for the next PR; groom the board immediately. Tech Lead [comment 5559186098](https://github.com/BenjaminBenetti/tut/pull/877#issuecomment-5559186098) identified four pushes in 25 minutes cancelling near-finished e2e runs. On #877, e2e took 9m53s; allow roughly 12 minutes for the full CI path instead of restarting it. A CI failure requiring a fix is different from a routine status update. Record publication state and pending notes in `.producer/` scratch; do not commit that tooling.

**Merge sweep resumed (Director, [18359273](https://github.com/BenjaminBenetti/tut/discussions/968#discussioncomment-18359273)):** the wind-down is withdrawn. Normal next-ticket sequencing continues; accepted work is not re-judged. Track the 22 PRs present at restart through actual merge, preserve stack order, and prepare the release digest once the Tech Lead is through the queue. The 9 September 06:00 UTC shutdown now bounds this work; do not keep a CLI or watcher running past it. #1018 and the rebased #1037 have both merged; publish subsequent handoffs from main. Do not treat pending work as released or the partial #960 frontage delivery as completion of outdoor arrangement.

**Current followed work threads:** the singleton also follows replies in #1091, #1077, #1051, #1067 and #1089 even when they omit the literal word Producer. These are active implementation, contract and integration threads addressed to this seat by context. `.producer/followed-threads.json` configures that set; it uses the existing REST sample, adds no poller or API calls, and retains the five-minute interval/three-hour deadline. Self-tests cover a MapGen approval without a role mention, unrelated threads, self-comment exclusion and the original event classes.
