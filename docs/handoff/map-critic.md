# Handoff: Map Critic

2026-09-08 — resumed after the two-day pause; 36 fresh maps reviewed,
#936 visually accepted, #937 merged during the bounded watch and re-checked.

## Calibration and boundaries

[Studio standing orders, Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968)
are now an explicit subscription for this seat. Anything that matters goes
on GitHub: work-scoped direction in the relevant issue/PR, cross-cutting
orders in #968. Terminal messages can remain unsubmitted. Read the thread
on refresh and include its exact query in each authorised watch. Map design
belongs to Map Critic and MapGen; the Director routes Executive Director
rulings, sets acceptance criteria and judges frames. Existing deliberate
rulings still stand. Ownership uses seat labels for engineers and role/area
for specialists; the Executive Director's assignable account is not an agent
claim. There is no production hold.

The Executive Director trusts this seat to file evidenced findings. Cap:
**five open Critic tickets**. File rather than park for taste. Escalate only
a genuine fork that would produce materially different games, or a conflict
with an explicit ruling. State uncertainty in a ticket when necessary.

**Real-place plausibility outranks tactical utility.** Both paved and
vegetated artificial settlement plinths were defects. Frequency and
placement belong to criterion one. Putting grass or useful cover on an
implausible object does not make it acceptable. Earlier planted-bed praise
is withdrawn. Preserve at-grade planting and real natural terrain. City
height should come from usable buildings, floors, roofs, stairs, ladders,
and land that actually rises; never recommend putting the mounds back.
Infantry/mech building-access distinctions remain deliberate.

The Director judges visual changes before merge; the Tech Lead merges.
The Critic supplies render findings and post-merge verdicts, not code review,
art, game-code changes, movement/LOS/balance certification or QA counts.
Map Lab is the instrument. Change one recipe parameter, look, then inspect
another angle before filing. Never inspect generator implementation to
explain a picture. Route to both areas when cause cannot be assigned by eye.

## Current ranked queue

Four open Critic tickets at this checkpoint:

1. **[#917](https://github.com/BenjaminBenetti/tut/issues/917), p2 — MapGen:**
   isolated rural fence panels describe no boundary. MapGen claimed this
   repair on resumed main `360778a`; it is active work. Its #968 update
   reports implementation and real before/after frames prepared, final
   validation running; no merged repair has been inspected yet. Re-check the original
   coastal/rural/small `mc-opening-01`, `(5,2,22)`, two angles after merge.
   Preserve recognisable timber fences and low cover in plausible boundaries.
2. **[#945](https://github.com/BenjaminBenetti/tut/issues/945), p2 — MapGen + Art:**
   natural ground materials meet in conspicuous squares/right angles.
   Filed this turn with coastal two-angle and snowy corroborating evidence.
   Producer queued it behind active #917. This concerns material contact,
   not the settled slope/crease geometry.
3. **[#959](https://github.com/BenjaminBenetti/tut/issues/959), p2 — MapGen + Art:**
   temperate rural trails disappear into broad dirt patches. Fresh P01/P02,
   `mc-resume-01`, temperate/rural/small, focus `(13,2,24)`, 45 px/tile,
   initial/one E turn; P03 snowy contrast control. Focus is the camera
   reference on the ridge above the trail. #204's snow/desert repair is
   preserved. Coordinate with #945 if one repair serves both outcomes.
4. **[#960](https://github.com/BenjaminBenetti/tut/issues/960), p2 — Art + MapGen:**
   city frontages and plots lack recognisable differences in everyday use.
   I01/I02 `mc-resume-01`, temperate/city/medium, `(43,2,39)`;
   I03/I04 `mc-opening-02`, same settings, `(23,1,34)`, both pairs at
   45 px/tile, initial/one E turn. Preserve wall-family appearances,
   restrained windows, different heights/footprints and roof access.
   #509/#511 and #492 already delivered material/glazing work; this asks
   for building-use identity, not a repeat of those changes.

No new city-flatness ticket is justified by the inspected views. The
post-removal floor/roof controls show a usable-looking infantry vertical
fight: successive furnished floors/stairs, roof openings and a neighbouring
ladder. That is a bounded visual judgement, not proof that every route works.
MapGen's mech outdoor-height cost is distinct from infantry building access;
#787 already owns future big-city overpasses. Do not duplicate it.

Continue by checking #917 when merged and the ranked repairs above. A fifth
slot is available; do not invent a defect to fill it. Interior lighting is
still a future play observation requested by the Director in #916 history:
current control interiors are dim, but this pass establishes the cutaway
improvement, not a general lighting failure or sign-off. Wider prop/plot
context is now included in #960 rather than held as a taste question.
Report if either owner begins queueing instead of working. At restart,
MapGen actively claimed #917 and Art completed #937; a queued successor is
not evidence that either seat has stalled.

## Merged fixes: render verdicts

- **#906 / #913:** snowy/desert bases now have visible support meeting the
  land, checked from two angles and against an already-grounded control.
  [Picture improved](https://github.com/BenjaminBenetti/tut/issues/906#issuecomment-5562936624).
- **#910 / #926:** the original raised paved enclosure is an ordinary plot.
  [Picture improved](https://github.com/BenjaminBenetti/tut/issues/910#issuecomment-5562936864).
  Its old planted exception is superseded by #936.
- **#915 / #932:** city asphalt now meets a paved, railed waterfront;
  the town gains a modest paved lookout. The town already had a railing.
  [Picture improved](https://github.com/BenjaminBenetti/tut/issues/915#issuecomment-5562936697),
  more strongly in the city, confirmed from a second angle.
- **#916 / #925:** intact buildings have shelter again; local cutaway works
  and closes after the squad leaves.
  [Picture improved](https://github.com/BenjaminBenetti/tut/issues/916#issuecomment-5562936788).
  Its old radius-2 baseline is preserved for #937.
- **#936 / #940**, merge `900d9a3`: planted boxes are gone, leaving ordinary
  snowy/coastal city yards. Town and rural preservation PNGs are byte-identical
  to their pre-removal controls; they are not claimed bed-removal cases.
  [Post-merge picture-improved verdict](https://github.com/BenjaminBenetti/tut/issues/936#issuecomment-5589275662)
  includes the usable-height judgement above. The 15 frames were inspected
  before the pause and committed on restart; runtime trees still matched.
- **#937 / #943**, merge `5e4ea1a`: radius **4**, opacity floor **0.175**.
  The Executive Director chose 4 over Art's original recommendation of 3,
  including the broad two-squad overlap; the Director accepted 0.175.
  **Picture improved on merged main `5040bd0`:** more room boundaries,
  furniture and space between squads are readable in pitched/flat scenes,
  both camera sides. Both roofs close when squads leave. Visible stipple
  and dim interiors remain limitations, not grounds to reverse the chosen
  wide reveal. [Posted verdict](https://github.com/BenjaminBenetti/tut/issues/937#issuecomment-5590284474).
  See the [merged check](../design/diagnostics/map-critic-post937/README.md).

## Evidence and publication

[Resumed survey and ranked queue](https://github.com/BenjaminBenetti/tut/issues/905#issuecomment-5590312244) are posted on the existing #905 survey record.

- [Opening assessment](../design/diagnostics/map-critic-opening/assessment.md):
  108 recipes, four biomes × three settlements × three sizes × three seeds,
  baseline `cafd9ff`, all inspected. Immutable evidence `dfbf26df4a43360bfd68fa614e2a7d520c56b1ed`.
  PR #907 merged; survey record #905 closed. Original taste/planted-bed
  framing is historical and explicitly superseded.
- [Calibration](../design/diagnostics/map-critic-calibration/README.md): eight
  frames on `f43f73c`, evidence `46270e9a6f369b09334730673989ac1f8f20b38b`.
- [Pre-#936 repair checks](../design/diagnostics/map-critic-recheck-936/README.md):
  21 frames on `2878dfc`, evidence `7055ffaf4f330ef7f1e752cddb4ff0d00d166c19`.
  PR **#918 merged** after all three CI jobs passed; its sidecar formatting
  review was resolved. Do not keep it listed as awaiting merge.
- [Post-#936 check](../design/diagnostics/map-critic-post936/README.md): 15
  frames on `900d9a3`, evidence `29399f9a5543c8b5a0d2aa268c5a682ba3b3baba`.
- [Resumed survey](../design/diagnostics/map-critic-resume-0908/README.md):
  36 fresh `mc-resume-01` recipes on main `360778a`, whole/closer pairs in
  nine sheets, a per-recipe ledger and exact manifest, plus seven focused
  PNGs. All 12 large whole views also opened at native resolution.
  Includes a second-seed building check. Evidence `3547686590364cd1d3735b598e26c8ecb72e3a97`.
- [Post-#937 check](../design/diagnostics/map-critic-post937/README.md): 16
  captures on main `5040bd0`, six previous-setting/runtime pairs and four
  closure frames. Old-setting frames use diagnostic overrides on the same
  current-main scene; they are not represented as old-build captures.
  Evidence `37290a6f89c4fd2e9c0f538d1fd04929baafc87d`.

Evidence PR **[#966](https://github.com/BenjaminBenetti/tut/pull/966) merged**
at 19:14:53 UTC as `d85ecd9`, after all three CI jobs passed at `91ed16b`.
The survey, repair crops and ranked queue are now on main.

The Director’s #968 subscription arrived during that merge. Its follow-up
is **[PR #971](https://github.com/BenjaminBenetti/tut/pull/971), handoff-only**,
on branch **`chore/968-map-critic-standing-orders`**
based on `d85ecd9`; no additional survey or game changes are included.
Local whitespace/link checks passed; normal PR CI applies to the follow-up.
Capture scripts/source frames, GH cache and watch result live under ignored
`.scratch/map-critic-resume-0908/`; earlier scratch directories remain useful.
No image was generated or retouched to show a defect. Comparison sheets
only resize/arrange captures and add captions outside the scene.

## Rulings and capture gotchas

Do not re-file #876 or N1. #813 permits bare unpaved cliffs; dramatic town
road grades do not reopen judged connectors. #849 was closed with its wider
coverage-bucket caveat. #869 owns ramps crossing continuous parapets. #701
owns isolated desert palms; #712 records temperate boulder intent; #281's
cover-density ruling stands. Trees' visible boundaries do not establish
LOS protection (#591).

**#947 is the owned cursor-cutaway gap**, active with Art ahead of #911.
The Executive Director wants hover to reveal interiors without a squad
inside. After merge, judge hovered, pointer/squad overlap and open-ground
roof-preservation controls. Art owns the parameters; the Director judges
the frames. The accepted #937 verdict is squad-only and does not certify
this new pointer behavior. Do not re-file its absence.

**#911 is the known dropship gap.** Extraction intentionally stays at deploy;
the TDF dropship is the arrival/return landmark. Art owns the model, MapGen
placement/clearance. Do not re-file a bare marked zone or separate extraction.

In Map Lab, units-off removes the camera-projection hook; use initial framing
for those controls. Keep the initial level label **all** for complete-building
views. Raw slider value 10/max 11 can still mean all. Moving it can select a
floor instead. Explicit floor controls use the observed slider value and
label, not an assumed mapping from the `floor` URL. The misnamed old H02
higher-storey attempt stays in scratch and is excluded from evidence.

The actual cutaway is exercised through `tools/art/preview/roof-cutaway.html`,
not Map Lab preview-unit presence. Its capture-only controls support roof,
units, yaw, radius and opacity floor. Use the stable capture Vite configuration.
Long terminal capture jobs have sometimes disappeared locally; TTY helped
but did not eliminate interruption. Preserve completed PNG/JSON pairs,
restart only the incomplete captures and verify the served baseline.

Local `pnpm lint` scans ignored `.scratch` scripts. Applicable checks exclude
that scratch tree without changing repo configuration:
`pnpm exec eslint . --ignore-pattern '.scratch/**'` and
`pnpm exec prettier --check . --ignore-path .prettierignore --ignore-path .gitignore --ignore-path .git/info/exclude`.
Format all new sidecar JSON. No game suites are needed for diagnostic-only
changes; normal PR CI still applies. Validate image dimensions, metadata,
links and the actual scope.

Avoid negated GitHub closing phrases: one unintentionally closed #906.
Use `References` for active findings; documentation PRs may link the already
closed survey #905 with the template's closing keyword. Never push main or
merge. Every GitHub comment starts with `**Map Critic** · TUT agent` alone.
A model-capacity error is transient: wait/retry, never change model.

## Watches — repair watch completed; standing-orders watch active

The resumed watch was session `72679`: **17:47:49–18:07:51 UTC on 2026-09-08**,
300-second polls, hard deadline **20:47:49 UTC**. It exited on #943's
18:05:54 merge. The merged picture was then captured and judged above.
`watch-start.json` and `watch-result.json` preserve the event. Do not restart
that completed watch. The Director subsequently authorised the new #968
subscription below; it is not an automatic restart.

The older opening watch `52713` ended on issue comments at 19:25 UTC on
September 6; follow-up watch `99123` ended on #940's candidate report at
23:12 UTC that day. Those are completed history, not running watchers.

### Director-requested #968 watch

**Original start 2026-09-08 19:15:28 UTC; unchanged hard stop 22:15:28 UTC.**
Session `75187` exited at 19:20:33 on the first discussion-comment batch.
All eight comments were read: seat acknowledgements, MapGen’s #917
validation/queue update, Art’s #947-before-#911 ordering and Producer’s
standing-orders documentation PR #970. No visual repair merged in that batch.
The exact query ran successfully.

The same bounded subscription was re-armed from that consumed snapshot at
19:22:13, **active session `59079`**. Its deadline was not extended; the old
terminal is finished, so only one is active. It uses 300-second polls and
exits on the first new
standing-orders comment, work-thread comment or merged map/art PR. It watches
#968 plus work threads #905/#917/#936/#937/#945/#959/#960 and PRs #966/#971.
Own Map Critic acknowledgements do not trigger it. Issue comment catch-up
starts at the last read, 18:57:51 UTC, so the publication interval is covered.

[Confirmed in the discussion](https://github.com/BenjaminBenetti/tut/discussions/968#discussioncomment-18355526). Its exact polling command is:

```sh
gh api graphql -f query='{repository(owner:"BenjaminBenetti",name:"tut"){discussion(number:968){comments(last:10){nodes{createdAt body}}}}}'
```

Initial script/event and cached discussion bodies:
`.scratch/map-critic-standing-orders-968/`. The **active re-arm** script and
start/health/result records are in its **`rearm-01/`** subdirectory. Inspect
that session/result state on
refresh before starting anything; never leave two watchers running. Follow
up the event in its GitHub thread, inspect any merged visual repair, and
retain #968 in future authorised watches. No cron was installed. Capacity,
websocket and transport failures remain retryable weather; do not change
model or redesign the loop in response.
