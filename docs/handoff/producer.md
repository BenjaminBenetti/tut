# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-08 19:36 UTC)

**Production is running.** [Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968) is the standing-orders channel, now inherited through Studio and all seven role briefs in merged #970 (`5d7aa29`). Work direction stays in issue/PR threads; every discussion comment wakes the existing single watcher. Against main `e0e9941`: **23 open issues, 3 with seat labels and 20 unowned**. GitHub Assignees stay empty; Owner records responsibility, not a substitute claim.

| Work | Seat / board responsibility | Current state |
|---|---|---|
| #735 p2 guard audit | `seat:eng-4`, Opus 5/max / Engineer | In Progress: A's 25 validators In Review #975; B's 10 command guards active; C's 8 remain |
| #961 p1 layer controls | `seat:eng-5`, Opus 5/max / Engineer | In Review #977; Director judgment pending on above-cut units and hillside limitation |
| #978 p1 hillside layer cut | `seat:eng-5` / Engineer | Blocked on #977 merge; claimed follow-through, not a second active job |
| #947 p1 cursor cutaway | Unowned / Art Director | In Progress; revised pointer depth floor+0.70, real-runtime evidence being regenerated |
| #917 p2 rural fences | Unowned / MapGen | In Review #973; Director accepted head `35575232`, Tech Lead merge pending |

**Ownership and routing:** #950 is Done via #962 with `seat:eng-5` retained; completed review work never returned to Backlog. #751 is Done via #972 (`c388fbc`), so eng-3 (Astra 6/xhigh) is free; #447 still needs hive decisions. #949 is Ready for the next available Opus seat. Check open PRs and claim threads before moving a ticket backwards. No pre-start sizing gate; Director routing takes precedence over older tier labels.

**Unowned — all open issues without a seat label:** #447, #450, #591, #594, #673, #701, #712, #734, #740, #760, #787, #793, #869, #911, #917, #945, #947, #949, #959, #960. Map/Art role claims remain visible in Owner; specialist seat-label inconsistency remains explicit.

**Dependencies:** #945 follows #917; #959 follows related #945; Art #911 follows #947 and MapGen agreement on footprint/16 clear boarding-and-start tiles; #960 follows #911. #760 awaits #447; decisions remain on #447/#591/#594/#712/#734. #787/#869 are Backlog, not pause-blocked. Other Ready: Art #450/#673/#740/#793, MapGen #701. Four Critic tickets (#917/#945/#959/#960), cap five; engineer #978 is outside that cap.

**Review / delivery:** open implementation/test PRs #973 (~18m), #975 (~13m), #976 (~11m), #977 (~10m), plus this handoff. QA evidence #974 and handoffs #969/#970/#971 are Done. #514 is Done with all 16 children closed. #751 completes M1's issue set; the milestone itself remains for the Director to close.

**Risks / stale claims:** #961 steps one storey/two engine layers, but its global cut anchors to the lowest building: #978 reports 46/108 maps with building-ground spreads of 2–6 layers, potentially hiding hillside buildings. Flat-map frames do not prove that case; the release verdict belongs on #977. QA #974 measured #869's old parapet-crossing ramps **2,046→0**; retiring that subclaim awaits the ruling requested on #869, while the latent kerb/connectivity hazard remains. Critic #966 accepts room visibility/reclosure; stipple and dim interiors remain. QA town fixtures exercise foundations; city starts do not in the measured sample. MapGen still owes ADR 0004 §7's waterfront row.

**Milestones, closed/total issues:** M0 13/13 · M1 65/65 · M1.5 41/50 · M2 49/50 · M2.5 31/37 · M3 1/4 · Arsenal 1/3 · Bestiary 1/1 · Tech Debt 6/8. Latest tag v0.2.12 (`121f397`); later #936/#753/#937/#457/#950/#751 deliveries remain untagged. Producer Astra 6/high; MapGen/Art Astra 6/xhigh; Critic Astra 6. One five-minute watch, three-hour deadline, fixed head per handoff PR.
<!-- digest:end -->



## Restart audit and owner ledger (2026-09-08)

The restart audit compared all open issues and 453 starting project cards against main and release tags. Merged handoff #944 was outside Done and was corrected. Subsequent deliveries completed #753, #937, #457, the original #514 epic, and #950; new tickets are reflected in the digest above. The accepted audit [#902](https://github.com/BenjaminBenetti/tut/issues/902#issuecomment-5561213567) remains resolved.

**Director corrections govern this record.** The hold ended at restart. GitHub account assignments were removed; ownership is a `seat:` label, with board Owner retained as the responsible role. The Director routed #961 directly to eng-5 with no sizing prerequisite. [Correction 5590197490](https://github.com/BenjaminBenetti/tut/issues/950#issuecomment-5590197490) establishes that #950 was finished and In Review, not queued behind #961; #962 has since merged. Retain its seat attribution. Check the open PR list before moving work backwards. Completed work in review does not compete for the active slot. Older process text requiring a pre-start tier or only one non-Done label is superseded by these explicit instructions.

The role column below records routing responsibility; only rows with a `seat:` label count as owned. Specialist work does not take an engineer seat.

| Issue(s), including audit completions | Accountable agent | Remaining work / real gate |
|---|---|---|
| #937 / #943 | Art Director, completed | Done; corrected fog frames independently verified, acceptance and CI green |
| #947 p1 | Art Director | In Progress: proposed radius3/rawpointer, 120ms dwell/150ms fade, separate graphics hit-test; parameters await evidence |
| #917 p2 | MapGen | In Review #973; frames accepted, merge pending |
| #945 p2 | MapGen, Art support | Natural material boundaries; cause assessment after #917 |
| #959 p2 | MapGen, Art support | Trail identity after related #945, not merely smooth material contacts |
| #960 p2 | Art Director, MapGen support | Recognisable building uses after #947/#911; live Critic work, not a taste hold |
| #911 p2 | Art Director, MapGen placement | Model after #947; agree proposed 5×7 / max-height 3.6 envelope, real support, rotation and 16 clear boarding/start tiles before modeling |
| #457 / #955 | eng-4, completed | Done; Director accepted the opposite-failure controls and the green gate passed |
| #753 / #948 | eng-5, completed | Merged/Done; live and reload city lookup proved, correcting the migration premise |
| #949 p2 | Tech Lead, next free Opus seat | Ready / low; objective labels and meaningful overflow fixture |
| #950 p2 | `seat:eng-5`, completed | Done via #962; retained attribution, schema-v17 migration and city-name rendering |
| #961 p1 | `seat:eng-5` | In Review #977; one storey/two engine layers; hillside limit measured in #978 |
| #978 p1 | `seat:eng-5` | Blocked on #977 merge; hillside floor/readout correction |
| #735 p2 | `seat:eng-4` | A (25 validators) In Review #975; B (10) active; C (8) remains |
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
