# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-09 01:15 UTC)

**Normal sequencing resumed; focus remains robust tactical UX and map generation.** The Tech Lead is sweeping the 22-PR queue under [Director order 18359273](https://github.com/BenjaminBenetti/tut/discussions/968#discussioncomment-18359273). Latest release remains **v0.2.15**; new merges are unreleased. First confirmed sweep merges: **#1018, #1033, #1038**. The Producer is tracking the original queue for the Director's release digest; this is an interim snapshot, not a completed sweep.

| Seat | Active / next / review |
|---|---|
| eng-3 · Astra 6/xhigh | #1024/#1036 In Review; available for suitable high-complexity work |
| eng-4 · Opus 5/max | **#1041 In Progress**, Director-bounded squad readiness/off-screen recovery; #1030/#1044 and #1029/#1051 submitted |
| eng-5 · Opus 5/max | #1035/#1045 and #1040/#1047 submitted; implementation slot available, review follow-ups remain |
| MapGen · Astra 6/xhigh | #1006 active, repair/evidence pushed; #1043 supporting cause assessment next, then latent #984/#1005/#591. #911/#1042 submitted; #960 outdoor arrangement still owed |
| Art · Astra 6/xhigh | **#1043 In Progress / primary claim**, material/readability side; #960 frontage kit #1048 accepted/In Review. **#450 stays deferred** |
| QA / Critic | QA #1027 delivered through #1038; overwatch guard #1046 In Review. Critic active, four findings open of five: #960/#1006/#1043/#1005 |

**Unowned (no seat):** #447, #673, #701, #712, #734, #760, #787, #869. #1041 is now claimed following the Director's scope ruling, not waiting for a sizing gate. **Real blocks:** #447 hive decisions; #734 ED difficulty targets; #760 behind #447. #787/#869 are Backlog; #701/#712 specialist Ready; #450/#673 deferred. No production hold or new M3 decomposition.

**Release risks:** stacks must integrate onto main in order: #1032→#1048, #1045→#1047, #1044→#1051; #1037 is being rebased/retargeted after merged #1018. #960 remains partial after the frontage kit: outdoor arrangement is not delivered by #1048. #1006 changes cover distribution; no claim of equal tactical value. Accepted PRs still require current-head gates; the Director cuts the tag after the sweep.

**Sequencing:** take the next suitable in-focus ticket after submission; keep review attribution and one active implementation. #793 is Done; difficulty #734/#1014, #450/#673 and post-mission #740 yield without cancellation. Defects found in passing are filed that day. Producer Astra 6/high coordinates #1026 and one bounded watch.

**Executive Director:** “So I think things are going well. Just keep at it.”
<!-- digest:end -->

## Delivery and evidence detail

**Map loop:** the Critic's current-main re-checks accept #945's natural contours, #959's temperate trails and #978's intact clamped-top roof. New coastal #1043 preserves those controls rather than reopening them. Art now carries its material/readability work; MapGen's supporting assessment follows active #1006. The urban-fence repair has 16 published before/after frames, accepted rural byte-identical controls, and a 108-map comparison: urban singletons 2,454→0, panels 2,496→2,494. Mean cover adjacency falls 14.05%→13.23% in towns and 11.50%→10.90% in cities; equal-looking panel totals do not imply equal tactical value. Director judgment and merged-main Critic re-check remain required.

**Partial delivery:** #1048 submits the six-module frontage kit for #960, Director-accepted at d546637, with the real scene/fog/layer controls and exact rural control. It deliberately does not close #960: use-specific outdoor arrangement remains due from MapGen. #911 generated placement is submitted in #1042; its model alone was already in v0.2.15. Consult the final placement PR for wider-sweep evidence rather than treating the earlier nine snowy fallback cases as outstanding by assumption.

**Tactical UX:** QA #1027's critique has merged in #1038; three findings remain tracked across #1041, #1035/#1040 and #1030, separate from the Critic cap. The Director has bounded #1041: see unspent AP without inspecting each unit, recover an off-screen selection, and make unspent-unit end turn non-silent. Eng-4 owns implementation and design choice, with no additional gate. #1044/#1051 submit the shared refusal/completed-action notification path; #1045/#1047 submit readable names and distinct squad attribution. #1034 removes movement from the log. Integrate the naming work before declaring the final legibility pass shipped.

**Accepted evidence:** #1032's pointer-removal acceptance carries to repaired spec head 212f953; production code and accepted frames are unchanged, and CI passed. #1036's movement proof establishes three right-click orders/final destinations (four tile steps), not four orders. #961's no-op and #978's distinct flat-map/roof control are delivered and accepted; #1019 is closed by Director order even while #1025 awaits merge. #1009's tether, #1020's corrected payout treatment and #1022's difficulty measurement preparation remain submitted review work until the sweep lands them. #1031 rejects placeholder-art captures while retaining gameplay fallback.

**Unowned and residuals:** #447/#734 decisions and #760's dependency remain real. #701/#712 are specialist Ready work; #787/#869 are Backlog. The #869 parapet-crossing subclaim measured 2,046→0 but retirement still needs a ruling. #735 is Done at 182/187 guards with five accepted exceptions; #793 is Done with its profiling limits retained. No new M3 decomposition. Milestone totals in the historical audit below are dated records; recompute non-PR closed/total counts for the final post-sweep digest rather than using milestone API counters.

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
| #740 p3 | `seat:eng-5` | In Review #1020, focus:deferred; treatment accepted at 377ccb5, new a0197db before frame, factual prose correction verified |
| #1019 p2 | `seat:eng-5`, completed | Done by Director acceptance of #1025; real flat-map/roof control delivered, evidence PR merge pending |
| #1021 p2 | `seat:eng-4` | In Review #1031 at 6c0656a: fail capture acceptance on actual asset fallback |
| #1023 p1 | `seat:art-director` | In Review #1032; Director accepted cc80d05, capture-CI repair before merge |
| #1024 p2 | `seat:eng-3` | In Review #1036 at e6cd466; Director accepted, three recorded legal moves plus fog/priority controls, merge paused |
| #1026 p2 epic | `seat:producer` | In Progress coordination; five native children #1027–#1030 and #1035; close only when all scope delivered |
| #1027 p2 | `seat:qa` | In Progress assigned; actual mission play critique, ranked evidence, five open findings cap; pickup unconfirmed |
| #1028 p2 | `seat:eng-5` | In Review #1034 at de0b758; real movement removed from log, consequence events retained |
| #1030 p2 | `seat:eng-4` | In Progress, medium; refusal inventory and explicit feedback contract |
| #1029 p2 | `seat:eng-4` | Ready after #1030 contract, medium; above-unit action indicators, no movement notification |
| #1035 p2 | `seat:eng-5` | In Progress, medium; canonical refusal text with UI names, typed diagnostic ids preserved, coordinate #1030 integration |
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

**Publication cadence:** normally push a handoff PR once and leave its head fixed until CI finishes and Tech Lead merges it. Batch subsequent digest changes for the next PR; groom the board immediately. Tech Lead [comment 5559186098](https://github.com/BenjaminBenetti/tut/pull/877#issuecomment-5559186098) identified four pushes in 25 minutes cancelling near-finished e2e runs. On #877, e2e took 9m53s; allow roughly 12 minutes for the full CI path instead of restarting it. A CI failure requiring a fix is different from a routine status update. Record publication state and pending notes in `.producer/` scratch; do not commit that tooling.

**Merge sweep resumed (Director, [18359273](https://github.com/BenjaminBenetti/tut/discussions/968#discussioncomment-18359273)):** the wind-down is withdrawn. Normal next-ticket sequencing continues; accepted work is not re-judged. Track the 22 PRs present at restart through actual merge, preserve stack order, and prepare the release digest once the Tech Lead is through the queue. #1018 has merged; rebase/retarget #1037 onto main before its merge. Do not treat pending work as released or the partial #960 frontage delivery as completion of outdoor arrangement.
