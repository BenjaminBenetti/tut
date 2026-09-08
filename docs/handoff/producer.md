# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-08 20:19 UTC)

**Production is running.** [Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968) is the standing-orders channel; work direction stays in issue/PR threads. #970 put it in Studio and every role brief; #980 removed obsolete predecessor instructions. Main `3ea2fb7`: **24 open issues, 9 seat-owned and 15 unowned**. No GitHub account assignees.

| Seat / work | Current state |
|---|---|
| eng-4, Opus 5/max | #992 low targeting cleanup In Progress; #983 rebase resolved, back In Review. #949/#989 and parent #735 remain In Review with attribution retained |
| eng-5, Opus 5/max | #978 p1 hillside cut In Progress; #981 p3 follows |
| `seat:mapgen`, Astra 6/xhigh | #945 p2 active; #959 next; #984 capacity contract queued after map-quality work |
| `seat:art-director`, Astra 6/xhigh | #947/#982 Done; #911 next but blocked on MapGen footprint/clearance response; #960 follows |
| eng-3, Astra 6/xhigh | Visibly idle; no suitable Ready high issue |

**Ownership fixed for the live specialist queue:** existing MapGen/Art seats now have claim labels on #945/#959/#984 and #911/#960 (completed #947 retains attribution). Process clarification is PR #990. Area labels remain intake/domain, Owner remains role responsibility; neither substitutes for a seat claim. One active job, not one non-Done label; no sizing gate.

**Unowned, no seat label:** #447, #450, #591, #594, #673, #701, #712, #734, #740, #760, #787, #793, #869, #981, #991. #991 is the p3 rail-layout follow-up, blocked on #989; keep “spawner”. Other actual gates: #959→#945; #960→#911; #981→#978; #760→#447; decisions #447/#591/#594/#712/#734. #787/#869 are Backlog, not pause-blocked. Other Ready: Art #450/#673/#740/#793, MapGen #701. No new M3 decomposition.

**Review / partial completion:** #735 A/#975 and B/#979 merged: 177/187 guards exercised. Tech Lead accepted retaining two capacity guards with property tests; #983 is rebased and awaits final disposition for three page-entry catches. 182/187 is still the combined-branch claim. #989's labels are Director-accepted but still wrap; #991 owns layout. Open handoffs/process: #987/#988/#990, all under an hour old, plus this update.

**Release / risks:** verified release **v0.2.13**, published 19:57:45 UTC, targets `cd412f5`; it includes #936/#753/#937/#457/#950/#751/#917/#961 and completes original epic #514 in a release. Pointer reveal #947/#982 (`3ea2fb7`) is newer and untagged. Fetch tags and check the release API; the earlier local tag cache was stale. #869's old crossings measured 2,046→0 in QA #974; subclaim-retirement ruling remains requested, latent hazard remains. ADR 0004 §7 owes waterfront/rural-fence rows. Critic re-check of fences and pointer reveal remains due; three Critic tickets open, cap five.

**Milestones, closed/total:** M0 13/13 · M1 65/65 · M1.5 42/50 · M2 49/50 · M2.5 33/39 · M3 1/4 · Arsenal 1/3 · Bestiary 1/1 · Tech Debt 6/10. Director closes milestones. Producer Astra 6/high; Critic Astra 6. One five-minute discussion/work watch, three-hour deadline; fixed head per PR.
<!-- digest:end -->



## Restart audit and owner ledger (2026-09-08)

The restart audit compared all open issues and 453 starting project cards against main and release tags. Merged handoff #944 was outside Done and was corrected. Subsequent deliveries completed #753, #937, #457, the original #514 epic, and #950; new tickets are reflected in the digest above. The accepted audit [#902](https://github.com/BenjaminBenetti/tut/issues/902#issuecomment-5561213567) remains resolved.

**Director corrections govern this record.** The hold ended at restart. GitHub account assignments were removed; ownership is a `seat:` label, with board Owner retained as the responsible role. The Director routed #961 directly to eng-5 with no sizing prerequisite. [Correction 5590197490](https://github.com/BenjaminBenetti/tut/issues/950#issuecomment-5590197490) establishes that #950 was finished and In Review, not queued behind #961; #962 has since merged. Retain its seat attribution. Check the open PR list before moving work backwards. Completed work in review does not compete for the active slot. Older process text requiring a pre-start tier or only one non-Done label is superseded by these explicit instructions.

The role column below records routing responsibility; only rows with a `seat:` label count as owned. Specialist work does not take an engineer seat: the existing roles use `seat:mapgen` and `seat:art-director`.

| Issue(s), including audit completions | Accountable agent | Remaining work / real gate |
|---|---|---|
| #937 / #943 | Art Director, completed | Done; corrected fog frames independently verified, acceptance and CI green |
| #947 p1 | `seat:art-director`, completed | Done via #982; accepted pointer reveal, floor+0.70 anchor |
| #917 p2 | MapGen, completed | Done via #973; Critic re-check due |
| #945 p2 | `seat:mapgen`, Art support | In Progress: natural material boundaries; #917 dependency cleared |
| #959 p2 | `seat:mapgen`, Art support | Trail identity after related #945, not merely smooth material contacts |
| #960 p2 | `seat:art-director`, MapGen support | Recognisable building uses after #947/#911; live Critic work, not a taste hold |
| #911 p2 | `seat:art-director`, MapGen placement | Model after #947; agree proposed 5×7 / max-height 3.6 envelope, real support, rotation and 16 clear boarding/start tiles before modeling |
| #457 / #955 | eng-4, completed | Done; Director accepted the opposite-failure controls and the green gate passed |
| #753 / #948 | eng-5, completed | Merged/Done; live and reload city lookup proved, correcting the migration premise |
| #949 p2 | `seat:eng-4` | In Review #989; id removal accepted, layout separate in #991 |
| #991 p3 | Engineer, no claim | Blocked on #989; rail layout, not vocabulary |
| #992 p3 | `seat:eng-4` | In Progress after #983 rebase; low shared-targeting-guard cleanup |
| #950 p2 | `seat:eng-5`, completed | Done via #962; retained attribution, schema-v17 migration and city-name rendering |
| #961 p1 | `seat:eng-5`, completed | Done via #977; one storey/two engine layers; hillside limit in #978 |
| #978 p1 | `seat:eng-5` | In Progress after #977; hillside floor/readout correction |
| #981 p3 | Engineer, no claim | Blocked after #978; above-cut-unit treatment, never hide units |
| #984 p2 | `seat:mapgen` | Ready after live map work; align map/deployment capacity contract, failing minimal-map test |
| #735 p2 | `seat:eng-4`, In Review | A/B merged; C/#983 rebased/In Review; two retained guards accepted, three page-entry dispositions pending |
| #450 p2 | Art Director | Ready: true Earth-coordinate texture, remove eleven marker nudges |
| #594 p2 | Art Director | Blocked on utility-thumbnail row design choice |
| #591 p2 | Director | Blocked on tree sight-blocking decision using current-scale evidence |
| #734 p2 | Director | Blocked on Executive Director difficulty targets |
| #751 p2 | `seat:eng-3`, completed | Done via #972; truthful defeat copy, existing rule preserved |
| #869 p2 | MapGen | Backlog latent kerb/connectivity hazard; old parapet crossing population now measured zero by QA #974; retirement ruling pending |
| #514 epic | Producer, completed | Done: all 16 children verified closed after #955 |
| #793 p3 | Art Director | Ready residual mist-cost profiling; allocation/CI repairs already shipped |
| #740 p3 | Art Director | Ready debrief reward treatment |
| #673 p3 | Art Director | Ready four stat glyphs plus stat-sheet use |
| #701 p3 | MapGen | Ready palm clustering follow-up; respect prior revert and refresh paired validation |
| #712 p3 | Director | Blocked on temperate-boulder clustering intent |
| #787 p3 | MapGen | Backlog future M3/ED overpass brief; scheduling is not a technical block |
| #760 p3 | MapGen | Blocked on #447 hive decisions before prototype |
| #447 p3 | MapGen, Director decisions | Crash-site prototype shipped; hive dimensions/passability still needed |

**Scope correction:** PR #948 distinguishes StartMission from FinishMission and reports live/reload render proof; the old #753 migration premise was incorrect according to that evidence. Tech Lead accepted it in merged #948.

**Evidence limits.** The 1.6-unit VFX heuristic is gone through #955; the separate kerb/connectivity repair hazard remains. QA #974 measured the old parapet-crossing population at zero after platform removal; retirement ruling is requested on #869. Main now has radius 4 / opacity 0.175 through #943; cursor-driven reveal is the remaining #947 feature. The Critic's post-#936 height verdict is bounded to the inspected infantry-accessible blocks; it does not erase MapGen's measured loss of mech-accessible outdoor height. This pass changes process records only, not game code or visual acceptance. Historical measurements and shutdown instructions below are superseded by this restart record.

## Current watch operation (2026-09-08)

[Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968) is the standing-orders channel: all comments are relevant to every seat. Work-scoped direction stays in issue/PR threads; the terminal starts or resumes the CLI. The studio process and every role brief now carry the channel.

The session watcher is `.producer/watch.py` (git-ignored workspace scratch). The pre-pause process was gone at restart; one bounded background terminal is re-armed after grooming. It is read-only and uses a process lock to enforce one watcher. `watch-state.json` keeps the cursor and poll time across re-arms; `watch-result.json` caches the event payload for grooming. The original four event classes plus discussion comments/edits/replies and self-comment exclusion passed `--selftest`; a paginated catch-up check retained older comments and reply continuation. Discussion polling extends the Director’s last-ten-comments GraphQL query with identity, edit and reply fields. All comment pages are read so bursts and edits are not lost. The live query passed. It remains one five-minute poller with a three-hour deadline. It never assigns seats or runs the inherited autofill/groom scripts. On API errors it exits visibly rather than retrying rapidly. These session files are not guaranteed to survive a replacement checkout; reconstruct this bounded watch if absent, following the standing rule above. Keep tooling changes out of handoff PRs.

**Publication cadence:** push a handoff PR once and leave its head fixed until CI finishes and Tech Lead merges it. Batch subsequent digest changes for the next PR; groom the board immediately. Tech Lead [comment 5559186098](https://github.com/BenjaminBenetti/tut/pull/877#issuecomment-5559186098) identified four pushes in 25 minutes cancelling near-finished e2e runs. On #877, e2e took 9m53s; allow roughly 12 minutes for the full CI path instead of restarting it. A CI failure requiring a fix is different from a routine status update. Record publication state and pending notes in `.producer/` scratch; do not commit that tooling.

Predecessor instructions from September 4–5 are retained in Git history, not as current operating directions. Follow the Status Digest, current role briefs and Discussion #968.
