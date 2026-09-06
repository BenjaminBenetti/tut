# Handoff: Map Critic

2026-09-06 — further calibration: raised vegetated beds are also defects (#936).

**Latest ruling supersedes earlier preservation advice.** Criterion one
(real place) outranks criterion three (tactical value). Planting and useful
height do not make an implausible settlement plinth acceptable. #936 owns
the raised vegetated beds; do not duplicate it. Earlier praise must not
prevent reporting a defect after the Executive Director overturns it.

After #936, look for believable settlements and usable vertical variety:
multi-storey buildings, interiors, roofs, stairs, ladders, and natural rising
land. A tall silhouette alone is not evidence of usable height. If cities
read tactically flat, file that with usable building height/roof access as
the intended improvement; never recommend restoring the mounds. Keep the
deliberate infantry/mech access rules and natural rural terrain.

**#937 is the next interior-readability check.** Art owns the roughly doubled
cutaway radius. Compare the same interior and camera at the old and merged
radius, including two separated units with overlapping reveals. Look for
readable squads, room boundaries, furniture and routes while the remaining
roof still reads as shelter. Judge the picture; do not retune the shader here.

The Executive Director raised the cap from three to **five** and authorised
working down findings without default taste holds. The standing bar is
somewhere on Earth people built and live in. **Placement, frequency and
plausibility belong to the real-place criterion.** A well-built, correctly
rendered feature can still be a generation defect because it does not belong
there. Escalate only a genuine fork that would produce materially different
games, or a conflict with an existing Executive Director ruling. When unsure,
file and state the uncertainty; the Director can downgrade it.

The Director still judges every frame before a visual change merges; the
Tech Lead merges. Report if MapGen or Art starts queueing instead of working
so the Director can reduce the cap. Lead with what to preserve, inspect a
second angle, cross-reference existing work, and route to both areas when
the cause cannot be assigned by eye.

## Evidence and judgement

All 108 opening Map Lab recipes were visually inspected: four biomes ×
rural/town/city × 48/72/96 × `mc-opening-01/02/03`. Each has a whole-map and
closer view; all 36 large-map whole views were also inspected at native
resolution. The [evidence index](../design/diagnostics/map-critic-opening/README.md),
[assessment](../design/diagnostics/map-critic-opening/assessment.md), and
[visual ledger](../design/diagnostics/map-critic-opening/visual-ledger.md)
record the method and observations: 27 comparison sheets and 13 detail/control
PNGs with JSON sidecars. Baseline `cafd9ff`, after #813, #826 and #891.
Original branch `docs/900-map-critic-opening` merged in #907.

The [calibration record and fresh evidence](../design/diagnostics/map-critic-calibration/README.md)
add eight inspected PNGs with JSON sidecars on main `f43f73c`: waterfront
second angle, two fence angles, two roof angles, units-off roof controls in
temperate and snow, and a roofed building control. Evidence is published at
`46270e9a6f369b09334730673989ac1f8f20b38b`. Current documentation branch:
`docs/910-map-critic-calibration`, [PR #918](https://github.com/BenjaminBenetti/tut/pull/918).
The Director's role amendment #912 is merged;
this branch leaves that contract to its own PR. Only diagnostic
documents/images and this handoff change. No generator implementation was read;
no prevalence, movement, LOS, balance or performance sign-off is claimed.
QA owns systematic counts if needed. Scripts, source frames and cached
issue history remain in Git-excluded `.scratch/map-critic-opening/` and
`.scratch/map-critic-calibration/`. Fresh searches found no open waterfront,
fence or missing-roof duplicate before filing.

Preserve the clear carriageway/pavement/door proportions, readable rooms off
corridors, warehouse/small-building contrast, materialled ladders, and real
changes in hills, vegetation, height and coast orientation between seeds.
The earlier praise of raised planted/stone city beds is withdrawn under
#936. Preserve appropriate vegetation and natural terrain, not those plinths.

## Current work and queue

1. **[#936](https://github.com/BenjaminBenetti/tut/issues/936), p1 — MapGen:**
   remove raised vegetated settlement beds. The preservation exception is
   overruled. Re-check a city and town for plausibility and usable vertical
   variety; preserve real hills and rural terrain. Do not restore plinths
   to satisfy the older outdoor-height target.
2. **[#937](https://github.com/BenjaminBenetti/tut/issues/937), p1 — Art:**
   roughly double the cutaway reveal radius. Check the same room and camera,
   a meaningful radius alternative, and two units whose reveals overlap.
   The room should become understandable while the roof remains shelter.
3. **[#917](https://github.com/BenjaminBenetti/tut/issues/917), p2 — MapGen:**
   isolated fence panels. F01/F02: `mc-opening-01`, coastal/rural/small,
   `(5,2,22)`, two angles, 45 px/tile. Keep a recognisable fence and useful
   low cover in plausible boundaries; usefulness is not an exception.

Track these three conservatively against the five-ticket cap; no new issue
is needed for #936 or #937. #911 remains the separately owned dropship gap.
Next filing candidate is hard material borders / temperate path ambiguity,
then broader building and plot variety. These are not default taste holds;
this session prioritises the merged-repair checks and the new rulings.

## Earlier fixes now merged

- **#906 / #913:** foundations merged as `24bdd8f`. Fresh snowy and desert
  views from both angles show the former black opening filled by visible
  support meeting the terrain. The already-grounded desert control still
  reads as seated in its surrounding land. Picture improved.
- **#916 / #925:** roofs and the local cutaway repair merged as `0d4a168`.
  The actual cutaway control on current main now reveals the squad and
  nearby floor, and closes the pitched roof when the squad leaves. The
  current radius is the baseline for #937, not its eventual verdict.
- **#910 / #926:** paved platforms merged as `fd032fd`. Its soil/vegetation
  exception is superseded by #936. The original tall paved enclosure at
  `(33,5,30)` is now an ordinary ground-level plot at `(33,3,30)`.
  Picture improved; scattered fences remain under #917.
- **#915 / #932:** waterfront treatment merged as `121f397`. City asphalt
  now stops before a paved, railed waterfront; both angles read more
  coherently. The town gains a modest paved lookout between road and rail.
  Picture improved, more strongly in the city. D03 already had a railing;
  the clearer street termination is the improvement.

The original baseline crops remain in the opening/calibration directories.
Fresh checks use main `2878dfc` (all four fixes present, #936/#937 still open
when fetched). The [re-check record](../design/diagnostics/map-critic-recheck-936/README.md)
contains 16 Map Lab captures and five actual cutaway-control frames, all
visually inspected, with reproduction metadata. The current reveal shows
the squad and nearby floor but leaves most of the room hidden. No closed
issue alone establishes a visual improvement.

Fresh evidence is published at `7055ffaf4f330ef7f1e752cddb4ff0d00d166c19`.
The render verdicts are posted on [#906](https://github.com/BenjaminBenetti/tut/issues/906#issuecomment-5562936624),
[#915](https://github.com/BenjaminBenetti/tut/issues/915#issuecomment-5562936697),
[#916](https://github.com/BenjaminBenetti/tut/issues/916#issuecomment-5562936788),
and [#910](https://github.com/BenjaminBenetti/tut/issues/910#issuecomment-5562936864).
The [survey correction](https://github.com/BenjaminBenetti/tut/issues/905#issuecomment-5562936942)
explicitly withdraws the old planted-bed praise.

The #936 candidate is now [PR #940](https://github.com/BenjaminBenetti/tut/pull/940),
head `c736206` when reported, awaiting frame judgement. MapGen reports
unchanged stock town maps and a natural-bank control in a different coastal
recipe. Our temperate C02 is a preservation control, not a claimed removal. The city cases supply the removal comparison.
MapGen also flags the loss of mech outdoor high ground; inspect usable
building height after merge without reopening the deliberate access rules.
At 23:21 UTC #940 remained open; #937 remained open and claimed by Art.
Neither repair was merged, so both post-merge checks remain pending.

## Rulings and gotchas

Do not re-file #876 or N1. The #813 allowance for bare unpaved cliffs stands;
severe-looking road grades in snow do not reopen judged connector geometry.
#849 was closed when checked, with the wider coverage-bucket caveat retained.
#869 owns city ramps crossing unbroken parapets. #701 owns isolated desert
palms; #712 records temperate boulder intent; #281 rules to retain cover
density. Prop context is not a request for more cover. Trees do not currently
block LOS (#591); their visual boundary is not proof of tactical protection.

**[#911](https://github.com/BenjaminBenetti/tut/issues/911) is the known dropship gap.**
Extraction deliberately stays on deploy; the TDF dropship is the arrival and
return landmark. Art owns the model; MapGen owns placement/clearance. A bare
marked rectangle is not a new finding. Do not resurrect separate extraction.

Prefer an unambiguous new capture when a caption caveat is necessary. D08 is
an intentional `floor=0` interior view; it must not illustrate missing roofs
or terrain. The new roof crops show all levels and the controls remove preview
units. #526's local ghosting and ADR 0004's roof-walkability distinction remain
deliberate. In Map Lab, units-off removes the camera-projection test hook;
use normal initial framing for those controls rather than inspecting map data.
For fresh captures keep the initial level label **all**. The slider steps by
two layers, so its raw value can be 10 while its maximum is 11 and the label
still says all. Do not mistake that numeric mismatch for a cut-off roof or
move the slider as a substitute: doing so can select a specific floor. C01's
sidecar records the observed all label. Discarded specific-floor capture
attempts remain in scratch and are not part of the committed evidence.

Avoid negated GitHub closing phrases in documentation PRs: a phrase intended
to say a PR did not repair #906 caused GitHub to close it. Reference active
visual tickets without closing keywords. Only the survey record #905 belongs
to this documentation work.

## Publication and watch outcome

The [one opening survey comment](https://github.com/BenjaminBenetti/tut/issues/905#issuecomment-5561538405)
is preserved as history; its platform taste framing is superseded by the
calibration above. [PR #907](https://github.com/BenjaminBenetti/tut/pull/907)
merged and #905 is closed. The initial follow-up issues published the authorised findings. No duplicate
platform or dropship issue was opened.

The **one bounded opening watch finished**. It ran from 2026-09-06 19:20:46 UTC
to the first poll at 19:25:48 UTC, at 300-second intervals with a hard stop
scheduled for 22:20:46 UTC. It exited on [Producer routing](https://github.com/BenjaminBenetti/tut/issues/906#issuecomment-5561567038)
and the [Art Director's claim](https://github.com/BenjaminBenetti/tut/issues/906#issuecomment-5561572589).
It reported no merged visual fix. The [Critic response](https://github.com/BenjaminBenetti/tut/issues/906#issuecomment-5561595914)
records the pending visual re-check. That was the opening-watch outcome; merged-repair verdicts are recorded above.

Do not restart that completed opening watch. Background terminal `52713`
finished; `watch-start.json`, `watch-result.json` and `watch.log` remain in
`.scratch/map-critic-opening/`. No cron or concurrent watcher was installed.

The Director's latest request had its own **single bounded watch**, session
`99123`, in `.scratch/map-critic-936/`: started 2026-09-06 22:52:35 UTC,
300-second polls, deadline 2026-09-07 01:52:35 UTC. It **exited at 23:12:36 UTC**
on [MapGen's #940 candidate report](https://github.com/BenjaminBenetti/tut/issues/936#issuecomment-5562862262).
No merged visual repair was reported by that watch. Its `watch-result.json`
and `watch.log` preserve the event. Do not restart it or install a concurrent
watcher. A candidate or green suite supplies no post-merge visual verdict.

PR #918 had a sidecar-formatting review. The three JSON sidecars were
formatted as requested. Local ESLint and Prettier pass for repository files;
the commands explicitly excluded Git-ignored `.scratch` capture scripts,
which the raw `pnpm lint` command otherwise scans locally. CI has no scratch
files. No lint configuration or game code was changed.
The [formatting reply](https://github.com/BenjaminBenetti/tut/pull/918#issuecomment-5562937029)
and PR description record the final scope. All three CI jobs were running
on the published evidence commit when checked at 23:21 UTC; Tech Lead owns
the eventual merge.

Never push main; only the Tech Lead merges. Every GitHub comment starts with
`**Map Critic** · TUT agent` on its own line. A model-capacity error is
transient: wait and retry, never switch model.
