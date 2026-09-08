# Producer handoff

> Long-lived role. Replacement: read this top to bottom, then `docs/process/roles/producer.md`.

<!-- digest:start -->
## Status Digest (2026-09-08 20:58 UTC)

**Production is running.** [Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968) is the standing-orders channel; work direction stays in issue/PR threads. Studio/all role briefs inherit it, and specialist claims are documented in merged #990. Main `906c6a9`: **21 open issues, 9 seat-owned and 12 unowned**. No GitHub account assignees.

| Seat / work | Current state |
|---|---|
| eng-3, Astra 6/xhigh | #996 p1/high capture reproducibility In Progress; pickup and diagnosis plan posted |
| eng-4, Opus 5/max | #594 p2/low utility-row treatment assigned In Progress; #991/#998 In Review retains attribution; #992 delivered |
| eng-5, Opus 5/max | #981 p3/medium above-cut-unit treatment assigned In Progress after merged #978/#999; retroactive #978 control owed after #996 |
| `seat:mapgen`, Astra 6/xhigh | #945 In Progress, cause and branch confirmed; #959 then #984 queued |
| `seat:art-director`, Astra 6/xhigh | #911 next, blocked on MapGen footprint/support/clearance reply; #960 follows; Art also watches #594 for judgment |

**Evidence risk:** #996 reports 15–30% tactical capture drift on unchanged code. eng-3 must test the cause and establish reach across tactical, Map Lab, art-preview and overworld captures. The Director explicitly accepted a weaker control for **#978 only**, judged its frames and cleared merge; #999 is Done. **eng-5 still owes the proper retroactive flat-map visual control after #996**, recorded in both issue bodies. No general exemption or global production hold follows. #945 pickup uncertainty is cleared by MapGen's concrete start and diagnosis, comment 5591598475.

**Unowned, no seat label:** #447, #450, #591, #673, #701, #712, #734, #740, #760, #787, #793, #869. Owner/area fields do not substitute for claims. Queued work and completed review work may retain a label; only one active implementation job. No sizing gate.

**Delivered / review:** #978/#999 fixes hillside buildings disappearing; the readout now counts the tallest building's actual floors, excluding terrain elevation. The example changes 4 to 3 without losing a floor (Tech Lead 5591717593). #992/#994 targeting cleanup is Done. #735 is Done at **182/187 guards exercised, up from 144/187**, with five Tech Lead-accepted exceptions; #984 tracks the capacity defect. #991/#998 remains In Review and must preserve “spawner”. Open PR list checked before routing either freed Opus seat.

**Dependencies / queue:** #959→#945; #960→#911; #911 needs the placement contract; #760→#447; decisions #447/#591/#712/#734. #594's old pre-prototype Art-choice gate is removed: build a concrete reversible proposal using existing assets, then render it for normal judgment. Backlog #787/#869 is not pause-blocked. Other Ready: Art #450/#673/#740/#793, MapGen #701/#984. Three Critic findings open, cap five. No new M3 decomposition in this pass.

**Release / residuals:** verified latest **v0.2.14** (20:27:58 UTC, `07acbfc`) includes pointer reveal #947, labels #949, and guard slices A/B. Slice C/#983, targeting cleanup #994 and hillside cut #999 merged afterward; do not call them released yet. #869's old crossings measured 2,046→0 in QA #974; subclaim-retirement ruling requested, latent hazard remains. ADR 0004 §7 owes waterfront/rural-fence rows. Critic re-check of fences/pointer reveal remains due. Board has no closed repository item outside Done at this check.

**Milestones, current API closed/total:** M0 14/14 · M1 65/65 · M1.5 45/53 · M2 49/50 · M2.5 35/39 · M3 1/2 · Arsenal 1/1 · Bestiary 1/1 · Tech Debt 8/11. Director closes milestones. Producer Astra 6/high; Critic Astra 6. One five-minute discussion/work watch, three-hour deadline; fixed head per PR.
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
| #945 p2 | `seat:mapgen`, Art support | In Progress; cause and branch confirmed, shared natural-material transition planned with data/geometry preserved |
| #959 p2 | `seat:mapgen`, Art support | Trail identity after related #945, not merely smooth material contacts |
| #960 p2 | `seat:art-director`, MapGen support | Recognisable building uses after #947/#911; live Critic work, not a taste hold |
| #911 p2 | `seat:art-director`, MapGen placement | Model after #947; agree proposed 5×7 / max-height 3.6 envelope, real support, rotation and 16 clear boarding/start tiles before modeling |
| #457 / #955 | eng-4, completed | Done; Director accepted the opposite-failure controls and the green gate passed |
| #753 / #948 | eng-5, completed | Merged/Done; live and reload city lookup proved, correcting the migration premise |
| #949 p2 | `seat:eng-4`, completed | Done via #989; layout separate in #991 |
| #991 p3 | `seat:eng-4` | In Review #998; rail layout and accurate wrap comment, preserve vocabulary |
| #992 p3 | `seat:eng-4`, completed | Done via #994; shared-targeting-guard cleanup |
| #950 p2 | `seat:eng-5`, completed | Done via #962; retained attribution, schema-v17 migration and city-name rendering |
| #961 p1 | `seat:eng-5`, completed | Done via #977; one storey/two engine layers; hillside limit in #978 |
| #978 p1 | `seat:eng-5`, completed | Done via #999 under explicit Director control substitution; proper rendered flat-map control owed after #996 |
| #981 p3 | `seat:eng-5` | In Progress, medium; dependency merged, above-cut-unit treatment, never hide units |
| #996 p1 | `seat:eng-3` | In Progress, high; reproducible tactical captures and measured reach across other harnesses |
| #984 p2 | `seat:mapgen` | Ready after live map work; align map/deployment capacity contract, failing minimal-map test |
| #735 p2 | `seat:eng-4`, completed | Done after A/B/C merges; 182/187, all five exceptions accepted; C post-v0.2.14 |
| #450 p2 | Art Director | Ready: true Earth-coordinate texture, remove eleven marker nudges |
| #594 p2 | `seat:eng-4`, Art judgment | In Progress, low; concrete utility-row proposal using existing assets, reported case and normal-thumbnail control |
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

**Evidence limits.** The 1.6-unit VFX heuristic is gone through #955; the separate kerb/connectivity repair hazard remains. QA #974 measured the old parapet-crossing population at zero after platform removal; retirement ruling is requested on #869. Main now has radius 4 / opacity 0.175 through #943; cursor-driven reveal #947 has also shipped through #982 in v0.2.14. The Critic's post-#936 height verdict is bounded to the inspected infantry-accessible blocks; it does not erase MapGen's measured loss of mech-accessible outdoor height. This pass changes process records only, not game code or visual acceptance. Historical measurements and shutdown instructions below are superseded by this restart record.

## Current watch operation (2026-09-08)

[Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968) is the standing-orders channel: all comments are relevant to every seat. Work-scoped direction stays in issue/PR threads; the terminal starts or resumes the CLI. The studio process and every role brief now carry the channel.

The session watcher is `.producer/watch.py` (git-ignored workspace scratch). The pre-pause process was gone at restart; one bounded background terminal is re-armed after grooming. It is read-only and uses a process lock to enforce one watcher. `watch-state.json` keeps the cursor and poll time across re-arms; `watch-result.json` caches the event payload for grooming. The original four event classes plus discussion comments/edits/replies and self-comment exclusion passed `--selftest`; a paginated catch-up check retained older comments and reply continuation. Discussion polling extends the Director’s last-ten-comments GraphQL query with identity, edit and reply fields. All comment pages are read so bursts and edits are not lost. The live query passed. It remains one five-minute poller with a three-hour deadline. It never assigns seats or runs the inherited autofill/groom scripts. On API errors it exits visibly rather than retrying rapidly. These session files are not guaranteed to survive a replacement checkout; reconstruct this bounded watch if absent, following the standing rule above. Keep tooling changes out of handoff PRs.

**Publication cadence:** push a handoff PR once and leave its head fixed until CI finishes and Tech Lead merges it. Batch subsequent digest changes for the next PR; groom the board immediately. Tech Lead [comment 5559186098](https://github.com/BenjaminBenetti/tut/pull/877#issuecomment-5559186098) identified four pushes in 25 minutes cancelling near-finished e2e runs. On #877, e2e took 9m53s; allow roughly 12 minutes for the full CI path instead of restarting it. A CI failure requiring a fix is different from a routine status update. Record publication state and pending notes in `.producer/` scratch; do not commit that tooling.

Predecessor instructions from September 4–5 are retained in Git history, not as current operating directions. Follow the Status Digest, current role briefs and Discussion #968.
