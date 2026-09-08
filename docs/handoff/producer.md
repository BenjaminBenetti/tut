# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-08 23:55 UTC)

**Focus: robust tactical UX and map generation · main `9d9ea01` · v0.2.15.** 26 open issues: **18 seat-owned, eight unowned**; all have priority/area/milestone, no account assignees. The 23:23 board audit found no stale closed/merged card or seat/Owner mismatch; three subsequent PRs are added. Standing orders: [#968](https://github.com/BenjaminBenetti/tut/discussions/968); work direction stays in issue/PR threads.

| Seat | Active / next / review |
|---|---|
| eng-3 · Astra 6/xhigh | #1024 In Progress; highlighted-interior movement, fog contract settled |
| eng-4 · Opus 5/max | #1030 In Progress → #1029; #1021/#1031 In Review; completed #1014/#1022 review yields outside focus |
| eng-5 · Opus 5/max | No active implementation or suitable unowned Ready engineer ticket; #981/#1009, #1028/#1034 and evidence #1025 In Review; post-mission #740/#1020 review yields |
| MapGen · Astra 6/xhigh | #911 In Progress → #1006 → #984 → #1005 → #591 |
| Art · Astra 6/xhigh | #960 resumed at 8e28fad; p1 #1032 capture-CI repair first, accepted visuals retained. #450 off-focus Backlog; handoff #1033 In Review |
| QA / Critic | QA #1027 assigned, pickup unconfirmed. Critic watch stopped 22:15; refresh/re-checks due, three findings open of five |

**Unowned:** #447, #673, #701, #712, #734, #760, #787, #869. **Blocked:** #447 hive decisions; #734 ED difficulty targets; #760 behind #447. #787/#869 are Backlog, not hold-blocked. #701/#712 are specialist Ready work; mech-bay #673 yields in Backlog. No sizing gate or new M3 decomposition.

**Delivery / risks:** both outage proof debts are accepted; #1019 is closed, evidence #1025 merge pending. #1032 has a capture-CI repair; #911's wider sweep exposed nine snowy landing fits, and #960 outdoor arrangements remain due. #869's measured-zero parapet subclaim awaits a retirement ruling. Details and reconciled milestone counts follow.

**Sequencing:** outside-focus work yields; built review work keeps its state. #793 is already Done; #734/#1014 difficulty work, #450, #673 and post-mission #740 are deferred. Defects found in passing still get filed that day. Producer Astra 6/high owns #1026 coordination and one bounded watch.

**Executive Director:** “So I think things are going well. Just keep at it.”
<!-- digest:end -->

## Delivery and evidence detail

**Map loop:** three open Critic findings, cap five: #960, #1006, #1005. #945/#1007 and #959/#1016 are Done and released in v0.2.15; Critic material/roof re-checks remain. #959 changed surface classification, preserving road geometry but increasing measured draw cost; do not repeat the superseded unchanged-draw claim. #911's model shipped through #1008, while generated reservation, support/clearance and placement proof remain MapGen's active scope. Its 216-map checks passed, but wider sweeps found nine snowy recipes needing ordered inset/cut fallbacks; final frequencies and fallback frames remain due, with no placement PR/acceptance yet. #960 still needs final integration and the requested MapGen outdoor arrangements.

**Executive Director play feedback:** #1023 removes pointer-follow reveal while preserving squad radius 4, opacity floor 0.175, eight slots and composition/fade exactly. Director accepted #1032 at cc80d05 after independently checking the exact controls; Tech Lead merge remains. Art resumed #960; #1032’s new browser test hit CI time budgets, and Art is reducing the test cost without changing accepted runtime/frames or global timeouts. No post-mortem requested. #1024 reproduced hidden placeholders and rendered walls intercepting movement clicks. Director ruling 5593167325 permits highlighted legal movement into unexplored interiors while preserving ordinary unhighlighted-fog refusal under #761, with a control. No policy block remains. These two Director tickets do not consume Critic slots.

**Tactical UX loop:** #1026 measures mouse and eye travel. QA #1027 plays missions, ranks evidenced defect/friction findings and records what works; its five-open-finding cap is separate from Map Critic. Eng-5 submitted independent #1028 in #1034 at de0b758, with real movement and retained consequence-event evidence, and reports its implementation queue empty. Eng-4 posted #1030's inventory: refusal words already exist, but most disabled actions never show them. The Director requires canonical `describeTacticalError` vocabulary and removal of raw ids; presentation/shared-mechanism choice remains with the seat, then #1029; the unstarted pair transferred after #1021's submission freed its slot. Wider design takes QA evidence. No sizing gate or preemption of map work.

**Evidence and review:** #996/#1013 is Done and released, with reliable captures and the roof guard. #961's no-op record and the distinct #978 flat-map/roof control are **both delivered and accepted**. Director independently verified #1025 at b608774 and explicitly ordered #1019 closed; #1025's merge remains pending. #981/#1009 rebased to 88278c0, has Director acceptance and a green local Tech Lead gate. #740/#1020 treatment is Art/Director-accepted at 377ccb5; newer a0197db includes the requested before frame. The prose must say no mech destroyed/no squad wiped, not a cost-free mission; the Director’s casualty-policy question is explicitly non-blocking. It remains In Review and yields as post-mission work. #1014/#1022 includes the requested method-doc correction at 5e530e1; it is completed, off-focus preparation in review, not authorized tuning. Eng-4’s #1030 → #1029 goes first. #1021/#1031 at 6c0656a submits actual-fallback rejection for captures while preserving gameplay fallback. Head gates and Tech Lead merge still apply.

**Unowned, no seat label:** #447, #673, #701, #712, #734, #760, #787, #869. Decisions #447 (remaining hive scope) and #734 (difficulty targets) are real blocks; #760 depends on #447. #701/#712 are Ready specialist work behind live queues. #787/#869 are Backlog, not pause-blocked. #869 leaves timing to MapGen; its old parapet-crossing subclaim measured 2,046→0 and still awaits a retirement ruling. No new M3 decomposition.

**Watch / residuals:** #793 is Done with the residual profile's measurement limits retained; #735 is Done at 182/187 guards with five accepted exceptions. ADR 0004 §7 waterfront/rural-fence rows remain due. Tech Lead's original #1003 red-gate merge is explicitly corrected with fail-closed tooling. Pending #1018 documents sampling every watched channel before exit; Producer already does so. One five-minute loop, three-hour bound; fixed head per handoff PR. Milestone non-PR issues, enumerated closed/total: M0 Foundation 13/13 · M1 Overworld 65/65 · M1.5 Map Generation 44/52 · M2 Basic Missions 49/50 · M3 Mission Variety 1/4 · Track: Arsenal 2/3 · Track: Bestiary 1/1 · Tech Debt 10/12 · M2.5 Tactical Feel 37/48. Director closes milestones.



## Restart audit and owner ledger (2026-09-08)

The restart audit compared all open issues and 453 starting project cards against main and release tags. Merged handoff #944 was outside Done and was corrected. Subsequent deliveries completed #753, #937, #457, the original #514 epic, and #950; new tickets are reflected in the digest above. The accepted audit [#902](https://github.com/BenjaminBenetti/tut/issues/902#issuecomment-5561213567) remains resolved.

**Director corrections govern this record.** The hold ended at restart. GitHub account assignments were removed; ownership is a `seat:` label, with board Owner retained as the responsible role. The Director routed #961 directly to eng-5 with no sizing prerequisite. [Correction 5590197490](https://github.com/BenjaminBenetti/tut/issues/950#issuecomment-5590197490) establishes that #950 was finished and In Review, not queued behind #961; #962 has since merged. Retain its seat attribution. Check the open PR list before moving work backwards. Completed work in review does not compete for the active slot. Older process text requiring a pre-start tier or only one non-Done label is superseded by these explicit instructions.

The role column below records routing responsibility; only rows with a `seat:` label count as owned. Specialist work does not take an engineer seat: the existing specialist roles use `seat:mapgen`, `seat:art-director` and `seat:qa`; Producer coordination uses `seat:producer`.

| Issue(s), including audit completions | Accountable agent | Remaining work / real gate |
|---|---|---|
| #937 / #943 | Art Director, completed | Done; corrected fog frames independently verified, acceptance and CI green |
| #947 p1 | `seat:art-director`, completed | Done via #982; accepted pointer reveal, floor+0.70 anchor |
| #917 p2 | MapGen, completed | Done via #973; Critic nine-frame re-check reports improvement, 5591954741 |
| #945 p2 | `seat:mapgen`, completed | Done via #1007 at c6be260; Critic merged-code re-check due |
| #959 p2 | `seat:mapgen`, completed | Done via #1016, released v0.2.15; Critic re-check due |
| #960 p2 | `seat:art-director`, MapGen support | Resumed In Progress at 8e28fad (six modules); #1032 submitted/accepted, final integration/arrangements remain |
| #911 p2 | `seat:mapgen`, Art model delivered | Partly complete, placement In Progress; #1008 model merged, generated support/site proof still owed |
| #457 / #955 | eng-4, completed | Done; Director accepted the opposite-failure controls and the green gate passed |
| #753 / #948 | eng-5, completed | Merged/Done; live and reload city lookup proved, correcting the migration premise |
| #949 p2 | `seat:eng-4`, completed | Done via #989; layout separate in #991 |
| #991 p3 | `seat:eng-4`, completed | Done via #998; rail layout corrected without renaming spawner |
| #992 p3 | `seat:eng-4`, completed | Done via #994; shared-targeting-guard cleanup |
| #950 p2 | `seat:eng-5`, completed | Done via #962; retained attribution, schema-v17 migration and city-name rendering |
| #961 p1 | `seat:eng-5`, completed | Done via #977; one storey/two engine layers; hillside limit in #978 |
| #978 p1 | `seat:eng-5`, completed | Done via #999 under explicit Director control substitution; flat-map/roof control Director-accepted in #1025; #1019 Done, evidence PR merge pending |
| #981 p3 | `seat:eng-5` | In Review #1009; rebased 88278c0, Director accepted, local TL gate green, merge pending |
| #996 p1 | `seat:eng-3`, completed | Done via #1013 at 086cab1, released v0.2.15; roof correction and reliable captures |
| #984 p2 | `seat:mapgen` | Ready after #1006; align map/deployment capacity contract, failing minimal-map test |
| #1006 p2 | `seat:mapgen` | Ready after #911; isolated urban panels, city proof and town corroboration, preserve rural boundaries |
| #1005 p3 | `seat:mapgen`, Art support | Ready after #984; water-surface seam diagnosis, separate from #945 |
| #735 p2 | `seat:eng-4`, completed | Done after A/B/C merges; 182/187, all five exceptions accepted; released through v0.2.15 |
| #450 p2 | `seat:art-director` | Backlog / focus:deferred; true-coordinate overworld Earth redraw, retained claim, not automatic after #960 |
| #594 p2 | `seat:eng-4`, completed | Done via #1002; Art settled glyph as utility category, selector carries fitted/empty state |
| #591 p2 | `seat:mapgen` | Ready after live queue; current-scale evidence and MapGen/Critic tree-opacity choice, separate from ED ambush ruling |
| #734 p2 | Director, no seat claim | Blocked on Executive Director difficulty targets, also focus:deferred; no calibration authorization |
| #751 p2 | `seat:eng-3`, completed | Done via #972; truthful defeat copy, existing rule preserved |
| #869 p2 | MapGen | Backlog latent kerb/connectivity hazard; old parapet crossing population now measured zero by QA #974; retirement ruling pending |
| #514 epic | Producer, completed | Done: all 16 children verified closed after #955 |
| #793 p3 | `seat:eng-4`, completed | Done; residual profile 5592431547 delivered, allocation/CI repairs shipped v0.2.6 |
| #1014 p3 | `seat:eng-4` | In Review #1022 at 5e530e1; completed preparation, focus:deferred, #734 stays ED-blocked |
| #740 p3 | `seat:eng-5` | In Review #1020, focus:deferred; treatment accepted at 377ccb5, new a0197db before frame, factual prose correction due |
| #1019 p2 | `seat:eng-5`, completed | Done by Director acceptance of #1025; real flat-map/roof control delivered, evidence PR merge pending |
| #1021 p2 | `seat:eng-4` | In Review #1031 at 6c0656a: fail capture acceptance on actual asset fallback |
| #1023 p1 | `seat:art-director` | In Review #1032; Director accepted cc80d05, capture-CI repair before merge |
| #1024 p2 | `seat:eng-3` | In Progress, pushed e872b171; real-click baseline fails and corrected repeats pass, final proof/gate pending |
| #1026 p2 epic | `seat:producer` | In Progress coordination; linked #1027–#1030, close only when all scope delivered |
| #1027 p2 | `seat:qa` | In Progress assigned; actual mission play critique, ranked evidence, five open findings cap; pickup unconfirmed |
| #1028 p2 | `seat:eng-5` | In Review #1034 at de0b758; real movement removed from log, consequence events retained |
| #1030 p2 | `seat:eng-4` | In Progress, medium; refusal inventory and explicit feedback contract |
| #1029 p2 | `seat:eng-4` | Ready after #1030 contract, medium; above-unit action indicators, no movement notification |
| #673 p3 | Art Director, no seat claim | Backlog / focus:deferred; four mech-bay stat glyphs plus stat-sheet use |
| #701 p3 | MapGen | Ready palm clustering follow-up; respect prior revert and refresh paired validation |
| #712 p3 | MapGen, no claim | Ready after live queue; MapGen/Critic decide and record temperate-boulder intent |
| #787 p3 | MapGen | Backlog future M3/ED overpass brief; scheduling is not a technical block |
| #760 p3 | MapGen | Blocked on #447 hive decisions before prototype |
| #447 p3 | MapGen, Director decisions | Crash-site prototype shipped; hive dimensions/passability still needed |

**Scope correction:** PR #948 distinguishes StartMission from FinishMission and reports live/reload render proof; the old #753 migration premise was incorrect according to that evidence. Tech Lead accepted it in merged #948.

**Evidence limits.** The 1.6-unit VFX heuristic is gone through #955; the separate kerb/connectivity repair hazard remains. QA #974 measured the old parapet-crossing population at zero after platform removal; retirement ruling is requested on #869. Main now has radius 4 / opacity 0.175 through #943; cursor-driven reveal #947 has also shipped through #982 in v0.2.14. The Critic's post-#936 height verdict is bounded to the inspected infantry-accessible blocks; it does not erase MapGen's measured loss of mech-accessible outdoor height. This pass changes process records only, not game code or visual acceptance. Historical measurements and shutdown instructions below are superseded by this restart record.

## Current watch operation (2026-09-08)

[Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968) is the standing-orders channel: all comments are relevant to every seat. Work-scoped direction stays in issue/PR threads; the terminal starts or resumes the CLI. The studio process and every role brief now carry the channel.

The session watcher is `.producer/watch.py` (git-ignored workspace scratch). The pre-pause process was gone at restart; one bounded background terminal is re-armed after grooming. It is read-only and uses a process lock to enforce one watcher. `watch-state.json` keeps the cursor and poll time across re-arms; `watch-result.json` caches the event payload for grooming. The original four event classes plus discussion comments/edits/replies and self-comment exclusion passed `--selftest`; a paginated catch-up check retained older comments and reply continuation. Discussion polling extends the Director’s last-ten-comments GraphQL query with identity, edit and reply fields. All comment pages are read so bursts and edits are not lost. The live query passed. It remains one five-minute poller with a three-hour deadline. It never assigns seats or runs the inherited autofill/groom scripts. On API errors it exits visibly rather than retrying rapidly. These session files are not guaranteed to survive a replacement checkout; reconstruct this bounded watch if absent, following the standing rule above. Keep tooling changes out of handoff PRs.

**Milestone counting:** derive progress from the paginated issue records, explicitly excluding PRs, and reconcile the open counts with the open-issue list. On this pass the milestone API counters underreported M3 (one open versus three listed) and Tech Debt (one versus two); its other totals also include milestone-linked PRs. Do not reuse those cached counters as issue progress. Scratch evidence: `.producer/audit-2026-09-08/all-issue-states.json`; rebuild it from `gh api --paginate` if the scratch checkout is absent.

**Publication cadence:** push a handoff PR once and leave its head fixed until CI finishes and Tech Lead merges it. Batch subsequent digest changes for the next PR; groom the board immediately. Tech Lead [comment 5559186098](https://github.com/BenjaminBenetti/tut/pull/877#issuecomment-5559186098) identified four pushes in 25 minutes cancelling near-finished e2e runs. On #877, e2e took 9m53s; allow roughly 12 minutes for the full CI path instead of restarting it. A CI failure requiring a fix is different from a routine status update. Record publication state and pending notes in `.producer/` scratch; do not commit that tooling.

Predecessor instructions from September 4–5 are retained in Git history, not as current operating directions. Follow the Status Digest, current role briefs and Discussion #968.
