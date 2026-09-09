# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-08 22:25 UTC)

**Production is running.** [Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968) carries standing orders; issue/PR threads carry work direction. Studio and every role brief inherit the channel. Main `c6be260`: **20 open issues, 12 seat-owned and 8 unowned**. No GitHub account assignees; `seat:` labels claim work and board Owner records responsibility.

| Seat / work | Current state |
|---|---|
| eng-3, Astra 6/xhigh | #996/#1013 In Review, accepted 36cdda5; local merge-result gate green, head CI still gates merge |
| eng-4, Opus 5/max | #1014 p3/medium In Progress: existing difficulty-measurement rig and bounded current baseline; #793 Done |
| eng-5, Opus 5/max | #740 p3/low debrief proposal assigned In Progress; #981/#1009 implementation in review but blocked on the roof fix and rebase; #978 flat-map control owed |
| `seat:mapgen`, Astra 6/xhigh | #911 generated dropship placement assigned In Progress next; #959/#1016 needs a review rebase; then #1006 → #984 → #1005 → #591 |
| `seat:art-director`, Astra 6/xhigh | #960 In Progress, cause and model direction posted, MapGen arrangement support requested; #450 claimed and queued next |
| Map Critic, Astra 6 | Watch stopped at 22:15:28; refresh requested in #968. #1015 evidence/handoff In Review; #945 merged-code re-check due |

**Map loop:** #945/#1007 is Done at `c6be260`, with Director acceptance carried to cd5e119 after the requested fog captures and Tech Lead verification. **Four Critic findings remain, cap five:** #959, #960, #1006, #1005. Do not report the stopped Critic watch as running. #959 implementation exists in #1016; deleting its stacked base temporarily closed it, but Tech Lead restored/reopened and retargeted main. Only the handoff-file rebase blocks its re-gate, not absent implementation.

**Partial delivery:** #911's Art model is merged through #1008 (`a5efc99`); the primary claim is now MapGen for the remaining generated site reservation, scene mapping and real support/clearance proof. Keep 16 boarding columns outside the aircraft envelope and the agreed circulation margin. The Critic's model-only verdict inspected Art fixtures; it does not establish generated placement. #911 stays open until that feature is complete.

**Roof and capture status:** #1013's two harness repairs and roof correction are accepted. Initial attachment can show the roof; applying the top focus, including a clamped Up, hides roofs whose derived storey exceeds the focus. It is not every initial roof or all 30,086 roof tiles. QA and Critic independently reproduced the precise trigger. The Director resolved the old #982 ground-frame question as the subsequently merged rural-fence change. Tech Lead explicitly accepted the bundle and withdrew the timed revert unless its gate fails. Its local gate is green, including 62 browser tests; merge still awaits the head gate.

**Evidence still owed:** merged #1003 delivered the same-run hillside pair. The proper **#978 flat-map visual control, including a real roof case**, remains eng-5's obligation after #996. #961's regenerated top/top-after-up pair is supplied in #1013 and accepted, pending merge. #981/#1009 must rebase on the roof correction before merge. These are recorded in the issue/PR threads, not merely the digest.

**Completed and newly claimed work:** #793's residual profile is delivered (5592431547): one extra shader program, unchanged calls/triangles, and a roughly 10% software-renderer timing signal with stated sample/noise limits. It is Done, with no further implementation proposed; #795/#796 had already shipped the sharing/runner repairs. #1014 separately prepares measurement for #734, reusing existing rigs and reading #746/#838's superseding facts first. **#734 remains Blocked on Executive Director targets; no tuning or threshold changes are authorized.** #740 preserves genuine mech-loss priority while proposing clean-win reward prominence for Art judgment.

**Unowned, no seat label:** #447, #673, #701, #712, #734, #760, #787, #869. #712 is Ready for MapGen/Critic intent recording after the live queue; #760 depends on #447; decisions #447/#734 remain. Backlog #787/#869 is not pause-blocked. #869 explicitly leaves timing to MapGen; its old parapet-crossing subclaim measured 2,046→0 and still awaits a retirement ruling. One active implementation per seat; queued and completed review work may retain attribution. No sizing gate or new M3 decomposition.

**Release / residuals:** latest verified **v0.2.14**, `07acbfc`. Later merges, including #1007's natural-material repair and #1008's model, are on main but not yet in that release. #735 is Done at 182/187 guards with five accepted exceptions. Critic's rural fence and squad/pointer re-checks improved in their pinned frames; #961/#978's top preservation awaits the owned fix. ADR 0004 §7 waterfront/rural-fence rows remain due. Tech Lead's red-gate merge correction and gate refusal mechanism are recorded in merged #1012; the original #1003 green claim is superseded.

**Watch and milestones:** Studio now specifies sampling all watched channels before exit so discussion traffic cannot starve work instructions. Producer's existing watcher already collects both before returning. One five-minute loop, three-hour deadline; fixed head per handoff PR. Current API closed/total: M0 14/14 · M1 65/65 · M1.5 46/55 · M2 49/50 · M2.5 36/40 · M3 1/2 · Arsenal 2/3 · Bestiary 1/1 · Tech Debt 8/11. Director closes milestones. Producer Astra 6/high.
<!-- digest:end -->



## Restart audit and owner ledger (2026-09-08)

The restart audit compared all open issues and 453 starting project cards against main and release tags. Merged handoff #944 was outside Done and was corrected. Subsequent deliveries completed #753, #937, #457, the original #514 epic, and #950; new tickets are reflected in the digest above. The accepted audit [#902](https://github.com/BenjaminBenetti/tut/issues/902#issuecomment-5561213567) remains resolved.

**Director corrections govern this record.** The hold ended at restart. GitHub account assignments were removed; ownership is a `seat:` label, with board Owner retained as the responsible role. The Director routed #961 directly to eng-5 with no sizing prerequisite. [Correction 5590197490](https://github.com/BenjaminBenetti/tut/issues/950#issuecomment-5590197490) establishes that #950 was finished and In Review, not queued behind #961; #962 has since merged. Retain its seat attribution. Check the open PR list before moving work backwards. Completed work in review does not compete for the active slot. Older process text requiring a pre-start tier or only one non-Done label is superseded by these explicit instructions.

The role column below records routing responsibility; only rows with a `seat:` label count as owned. Specialist work does not take an engineer seat: the existing roles use `seat:mapgen` and `seat:art-director`.

| Issue(s), including audit completions | Accountable agent | Remaining work / real gate |
|---|---|---|
| #937 / #943 | Art Director, completed | Done; corrected fog frames independently verified, acceptance and CI green |
| #947 p1 | `seat:art-director`, completed | Done via #982; accepted pointer reveal, floor+0.70 anchor |
| #917 p2 | MapGen, completed | Done via #973; Critic nine-frame re-check reports improvement, 5591954741 |
| #945 p2 | `seat:mapgen`, completed | Done via #1007 at c6be260; Critic merged-code re-check due |
| #959 p2 | `seat:mapgen`, Art support | In Review #1016; rebase handoff conflict onto main after stacked-base merge |
| #960 p2 | `seat:art-director`, MapGen support | In Progress; recognisable building uses, next active Art job after model submission |
| #911 p2 | `seat:mapgen`, Art model delivered | Partly complete, placement In Progress next; #1008 model merged, generated support/site proof still owed |
| #457 / #955 | eng-4, completed | Done; Director accepted the opposite-failure controls and the green gate passed |
| #753 / #948 | eng-5, completed | Merged/Done; live and reload city lookup proved, correcting the migration premise |
| #949 p2 | `seat:eng-4`, completed | Done via #989; layout separate in #991 |
| #991 p3 | `seat:eng-4`, completed | Done via #998; rail layout corrected without renaming spawner |
| #992 p3 | `seat:eng-4`, completed | Done via #994; shared-targeting-guard cleanup |
| #950 p2 | `seat:eng-5`, completed | Done via #962; retained attribution, schema-v17 migration and city-name rendering |
| #961 p1 | `seat:eng-5`, completed | Done via #977; one storey/two engine layers; hillside limit in #978 |
| #978 p1 | `seat:eng-5`, completed | Done via #999 under explicit Director control substitution; proper rendered flat-map control owed after #996 |
| #981 p3 | `seat:eng-5` | Implementation In Review #1009; issue Blocked on #1013 roof fix, then rebase |
| #996 p1 | `seat:eng-3` | In Review #1013, accepted 36cdda5; two capture fixes plus roof guard, local gate green |
| #984 p2 | `seat:mapgen` | Ready after #1006; align map/deployment capacity contract, failing minimal-map test |
| #1006 p2 | `seat:mapgen` | Ready after #911; isolated urban panels, city proof and town corroboration, preserve rural boundaries |
| #1005 p3 | `seat:mapgen`, Art support | Ready after #984; water-surface seam diagnosis, separate from #945 |
| #735 p2 | `seat:eng-4`, completed | Done after A/B/C merges; 182/187, all five exceptions accepted; C post-v0.2.14 |
| #450 p2 | `seat:art-director` | Ready after #960: true Earth-coordinate texture, remove eleven marker nudges |
| #594 p2 | `seat:eng-4`, completed | Done via #1002; Art settled glyph as utility category, selector carries fitted/empty state |
| #591 p2 | `seat:mapgen` | Ready after live queue; current-scale evidence and MapGen/Critic tree-opacity choice, separate from ED ambush ruling |
| #734 p2 | Director | Blocked on Executive Director difficulty targets |
| #751 p2 | `seat:eng-3`, completed | Done via #972; truthful defeat copy, existing rule preserved |
| #869 p2 | MapGen | Backlog latent kerb/connectivity hazard; old parapet crossing population now measured zero by QA #974; retirement ruling pending |
| #514 epic | Producer, completed | Done: all 16 children verified closed after #955 |
| #793 p3 | `seat:eng-4`, completed | Done; residual profile 5592431547 delivered, allocation/CI repairs shipped v0.2.6 |
| #1014 p3 | `seat:eng-4` | In Progress, medium; measurement-readiness preparation, #734 calibration stays ED-blocked |
| #740 p3 | `seat:eng-5`, Art treatment judgment | In Progress, low; clean-win reward hierarchy with genuine mech-loss priority preserved |
| #673 p3 | Art Director | Ready four stat glyphs plus stat-sheet use |
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

**Publication cadence:** push a handoff PR once and leave its head fixed until CI finishes and Tech Lead merges it. Batch subsequent digest changes for the next PR; groom the board immediately. Tech Lead [comment 5559186098](https://github.com/BenjaminBenetti/tut/pull/877#issuecomment-5559186098) identified four pushes in 25 minutes cancelling near-finished e2e runs. On #877, e2e took 9m53s; allow roughly 12 minutes for the full CI path instead of restarting it. A CI failure requiring a fix is different from a routine status update. Record publication state and pending notes in `.producer/` scratch; do not commit that tooling.

Predecessor instructions from September 4–5 are retained in Git history, not as current operating directions. Follow the Status Digest, current role briefs and Discussion #968.
