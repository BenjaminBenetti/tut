# Handoff: Map Critic

9 September 2026 UTC, **03:35 checkpoint: survey v0.2.16 when published**.
The Executive Director widened this seat's brief in [epic #1068](https://github.com/BenjaminBenetti/tut/issues/1068):
Earth locations should read as themselves, through biome, materials,
buildings and props. Rank that second axis alongside the defect list.
**Robustness comes first; every variety ticket carries earlier defect
controls.** Survey the release tag, not intervening main. Tickets follow
frames, not catalogue inspection or the epic alone.
[Task acknowledgement](https://github.com/BenjaminBenetti/tut/issues/1068#issuecomment-5595331058).
No v0.2.16 release/tag was present at the 03:34 watch cycle.

**One open Critic issue: #960. Four slots available.** #1006, #1043 and
#1005 have merged and closed; fresh release-frame verdicts remain owed.
#911 is existing Director-owned work, still in integration, not a new slot.
The v0.2.15 survey, #945/#959/#978 repair checks and fresh merged
#1032 cutaway / #1048 frontages are complete and posted. Evidence docs
PRs #1049 and #1057 are merged; do not reopen their deleted branches.
Current docs branch: `docs/1068-map-critic-variety-brief`.

Next, in order:

1. Pin the published v0.2.16 tag and runtime trees; start a fresh isolated
   capture server. Re-check fences (#1006), coastal route (#1043), water
   (#1005), and any #911/#960 work actually included in that tag.
2. Survey declared Earth locations, starting with Johannesburg, Perth and
   Lagos, alongside other useful campaign contrasts. Verify each release
   location claim and recipe; look in Map Lab, then change one parameter.
   Compare a second angle before calling a finding real. Catalogue entries
   identify claims, never prove a visual defect.
3. Commit crops/recipes and file the strongest evidenced findings, within
   cap five, before expanding the narrative. Post ranked defect **and**
   variety lists under #905/#1068, leading with what to preserve.
4. Keep this handoff and the singleton watch current. No percentage is
   exposed to these tools; the Director's earlier 67% was a dated operator
   measurement, not a current estimate.

One watcher, `.scratch/map-critic-v0216/watch.py`, window **03:26:54 →
06:26:54 UTC**, includes Discussion #968 and publication of v0.2.16.
All channels through 03:34:19 consumed; use its config/session files for
live state. The older 23:52–02:52 window ended; it did not run through the
later pause. All old capture servers are stopped. No current-main scratch
frame is relabelled as release evidence.

## Calibration and boundaries

[Studio standing orders, Discussion #968](https://github.com/BenjaminBenetti/tut/discussions/968)
are now an explicit subscription for this seat. Anything that matters goes
on GitHub: work-scoped direction in the relevant issue/PR, cross-cutting
orders in #968. Terminal messages can remain unsubmitted. Read the thread
on refresh and include its exact query in each authorised watch. Map design
belongs to Map Critic and MapGen; the Director routes Executive Director
rulings, sets acceptance criteria and judges frames. Existing deliberate
rulings still stand. Ownership uses `seat:mapgen` and `seat:art-director` for the existing
specialists as well as engineer seat labels; area labels remain intake/domain
and Board Owner remains role accountability. The Executive Director’s
assignable account is not an agent claim. There is no production hold.

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

## Current ranked queue and merged work awaiting release checks

1. **[#960](https://github.com/BenjaminBenetti/tut/issues/960), p2, MapGen primary:**
   plots need recognisable everyday uses. Art frontages merged #1048 and
   passed the Critic's fresh six-frame check. The actual yard bench merged
   #1060 at `eb96d5a` (accepted head `830ebdd`). MapGen's outdoor arrangement
   remains active, temporarily interrupted for #1042 integration repairs.
   Actual-model after captures were underway at the `f20701a` checkpoint;
   no final generation PR or Critic after-frame acceptance was observed.
   Preserve wall families, restrained glazing, height/roof access, rural
   context and mission routes. Do not re-file generic clutter as a new issue.
   Owner's latest 108 paired-map counts at `5338e66` are QA evidence, not
   Critic certification: rural unchanged; town clutter1003→317, city2171→519;
   cover adjacency13.71→12.66% town and11.63→8.79% city. Earlier first-shot
   regression was repaired by protecting mission placement; final real
   frames and tests belong to the owner. Bench is yard-only, not a generic
   ground-pool substitute.

Closed repairs, in release-check order:

- **#1006**, urban fence fragments: #1052 merged **02:07:50**, `8d20dd4`,
  accepted head `0233926`. Sixteen author preview frames inspected and
  positive. Fresh release check owed. Primary pair `mc-opening-03`,
  coastal/city/medium72, focus(51,1,31),55px/tile,two angles; keep rural
  #917 and built waterfront controls. Finite useful boundaries are accepted.
- **#1043**, coastal rural route lost in bare soil: #1055 merged **02:17:36**,
  `8e9c8fb`, accepted head `1746cb9`. Fourteen author frames opened and
  positive, four control pairs byte-identical. Fresh release check owed.
  `mc-resume-03`,coastal/rural/small48; junction(21,2,10),initial/one E;
  approach(13,2,24),45px/tile. Stone is plausible substantial-building
  access; no blanket dirt-path requirement. [Preview verdict](https://github.com/BenjaminBenetti/tut/pull/1055#issuecomment-5594596868).
- **#1005**, grid across continuous open water: Art repair #1064 merged
  **03:22:16**, `bb28b8d`, accepted head `9fdf227`. MapGen's diagnosis was
  handed to Art; the old queued-MapGen production claim is superseded.
  Author has ten final before/after frames in `docs/design/diagnostics/1005/`;
  **Critic has not opened those or made a fresh release verdict yet**.
  Primary water pair `mc-opening-01`,coastal/rural/small48,(40,0,4),55px/tile.
  Check two sides, waterfronts and dry ground, preserving shore silhouettes.
  [Owner evidence and scope](https://github.com/BenjaminBenetti/tut/issues/1005#issuecomment-5595078090).

[#1006/#1005 original evidence](../design/diagnostics/map-critic-v0213/followups/README.md)
(city `ebf67d7`, water `d8babd8`) and [#1043 original evidence](../design/diagnostics/map-critic-v0215/coastal-trail/README.md)
(`ce1ea0c`) remain immutable. A closed issue is not a fresh visual verdict.
No new variety ranking or ticket has been established yet.

**No stone-identity defect established:** the reported temperate route and
new small and large rural seed read as plausible surfaced access lanes serving
substantial buildings. They are visibly stone/cobble, not dirt footpaths.
Retain the route's distinction in future variety work; do not demand a
particular material for all rural tracks. The large rural case is now checked too.

**No new flat-city finding established:** different occupied heights,
roof openings, stairs and exterior access remain visible after the plinths
were removed. This is a bounded picture judgement, not movement/LOS or
mech access certification. #787 already owns future big-city overpasses.

## Repair verdicts and superseding decisions

- **#945 / #1007**, merged `c6be260`: irregular coastal material contacts
  and rounded snowy rock margins hold up from both sides. Built waterfront
  edges and the snowy trail retain readability. New baseline `9d9ea01`;
  old images are dated records, not silently refreshed comparison controls.
- **#959 / #1016**, merged `ad72e5d`: the temperate track stays continuous
  across bare earth in both directions. Snowy/desert controls remain clear.
  Our current-main images are visual preservation checks, not the separate
  isolated-change byte comparisons that the author provided.
- **#961 / #978 / #996**, top-limit correction merged in **#1013**, `086cab1`.
  Prior Critic `d0837c6` evidence showed the exact trigger: initial 5/5 roof
  intact, clamped `]` removes the tallest roof while still displaying 5/5.
  It never showed all roofs missing by default. **Picture improved** on
  `9d9ea01`: both clamped-top frames keep the roof, and both initial/top
  pairs are byte-identical within their runs. Lower-floor views retain
  rooms/corridors/stairs. [Posted verdict](https://github.com/BenjaminBenetti/tut/issues/978#issuecomment-5593853528),
  [eight opened frames](../design/diagnostics/map-critic-v0215/layers/README.md),
  `5368629`. Ordinary campaign4242, mission1127010053, same reported tower. Eng-3's
  separate flat-map/hillside proof was accepted under #1019/#1025 and is
  no longer owed. Historical [Critic layers](../design/diagnostics/map-critic-v0213/layers/README.md)
  remain at their recorded identity.
- **#1023 removes pointer-follow reveal deliberately.** Art #1032 merged
  as `166876d` at 01:17:02 UTC. **Fresh-main check complete: all 20 frames
  individually inspected**, pitched/flat × two camera sides × closed/hover/
  two squads/hover overlap/closure. Roofs stay intact under mouse movement,
  squad views retain readable rooms/furniture, roofs close when squads leave.
  Every scene's closed/hover/restored images are byte-identical; its squad/
  mouse-over images match. Preserve **squad radius 4 / .175**. Dim interiors
  and stipple remain recorded limitations, not a reversal request.
  [Fresh evidence](../design/diagnostics/map-critic-post1032/README.md),
  committed/pushed `18e9808`; [posted verdict](https://github.com/BenjaminBenetti/tut/issues/1023#issuecomment-5594502689).
  Driver `.scratch/map-critic-v0215/post1032.mjs`, terminal 25804 completed0.
  Isolated runtime `166876d`, port4177/session20110 now stopped; sidecars record its trees.
  The earlier 24-frame Critic pointer/squad/closure acceptance under
  #937/#947 was true of its then-current build. It does not argue against
  the new Executive Director ruling. Do not re-file absent hover reveal
  after #1032 merges. Current-main roof controls keep the pointer offscene.
- **#917 / #973**, merged `07b40cd`: fresh v0.2.13 nine-frame check confirmed
  beach fragments removed, contextual trail/plot runs, clear approaches
  and preserved waterfront. [Verdict](https://github.com/BenjaminBenetti/tut/issues/917#issuecomment-5591954741),
  [frames](../design/diagnostics/map-critic-v0213/README.md), `132a5cb`.
  The visible open garden end marks a legible plot boundary; no separate
  ticket for that case. This is not blanket permission for arbitrary stubs
  and not a demand that every plot be enclosed. New rural frames retain
  the context; urban isolated panels are the separate #1006, now merged awaiting a release check.

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

Current [v0.2.15 repair record](../design/diagnostics/map-critic-v0215/repairs/README.md):
nine native PNG/JSON pairs, all opened, evidence `e502078`. Sidecars contain
exact recipes, actual camera pitch/crop, all-level readout, PNG hashes,
error lists and a fresh-server runtime identity.

Current broad survey is **24 recipes completed and inspected**: four biomes
× three settlements × small48/large96, new seed `mc-resume-03`; 48 whole/near
source views, changing one parameter between recipes. All six sheets were
also opened. [Survey and recipes](../design/diagnostics/map-critic-v0215/survey/README.md),
[visual ledger](../design/diagnostics/map-critic-v0215/survey/visual-ledger.md).
This extends prior all-size/all-seed work, not every combination on v0.2.15.
Large coastal rural context corroborates #1043; its native two-angle junction
record remains the primary proof. All other shortcomings cross-reference the
existing queue; no fifth distinct defect was established in this pass.

**#960 author context preview judged separately:** all twelve before/after
PNGs at `f0bd0b9302cd4c3d5a1f39184332ce9992d63b7b` opened; all hashes match
pinned metadata and the rural C01 before/after bytes match. Domestic window
planting/guards, shared entrance cues and the nearby shop/workplace canopies
improve building-use recognition; the shop awning clears the ladder. Outdoor
arrangements remain unfinished under #960/#1006. [Provisional verdict](https://github.com/BenjaminBenetti/tut/issues/960#issuecomment-5594085278).
Before runtime9d9ea01, after2a979c7 with accepted units-only #1032 integrated.
This is attributed author evidence, not our fresh-main acceptance or an
independent recreation of browser-repeat, final unit/level/fog controls.
Art submitted **#1048 at d546637**, stacked on #1032, and Director accepted.
It merged on main as `8451a08` at 01:30:23 UTC.
All eighteen paired final unit/level/fog frames are now opened too, all hashes
verified, all eight published restoration images exactly match their phase's
closed control. [Final-controls judgment](https://github.com/BenjaminBenetti/tut/pull/1048#issuecomment-5594221931).
**Fresh-main frontage check complete on `8451a08`: all six native views
opened and hash-verified.** Both city seeds gain recognisable residential
cues; S01 distinguishes shop/workplace/home and preserves the ladder; rural
C01 remains unchanged. Each fresh PNG matches the accepted author after
frame byte-for-byte. #960 stays open for outdoor arrangement.
[Fresh evidence](../design/diagnostics/map-critic-post1048/README.md), `fdc3034`;
[posted main verdict](https://github.com/BenjaminBenetti/tut/issues/960#issuecomment-5594621085).
Driver `frontage-camera.mjs`, final terminal70271 completed0; scratch
`post1048-camera/`, isolated port4176/session77234 now stopped. It uses the production
camera rig accessor to match accepted framing, without map/scene changes.
The earlier manual-camera I01 and failed/incomplete attempts remain scratch
only. Initial server22020 ended SIGTERM143; the same pinned8451a08 restarted.


**#1006 preview:** sixteen author frames at13a8914 opened, all hashes verified;
before9d9ea01/after03569fb. City fragments disappear, retained city/town fences
read as plot boundaries, rural controls byte-identical, waterfront preserved.
The owner's lower distributed-cover measurement is a disclosed tradeoff; do
not restore implausible fragments for tactical usefulness. [Provisional verdict](https://github.com/BenjaminBenetti/tut/issues/1006#issuecomment-5594198760).
Director accepted submitted #1052 at `0233926`. Fresh-main check remains owed.

Prior records, all already published:

- [Opening assessment](../design/diagnostics/map-critic-opening/assessment.md):
  108 recipes, baseline `cafd9ff`, all inspected, evidence `dfbf26d`; #907 merged.
  Survey issue #905 is the continuing record, closed rather than a cap slot.
- [Calibration](../design/diagnostics/map-critic-calibration/README.md): eight
  frames, `f43f73c`, evidence `46270e9`; old planted-bed praise superseded.
- [Pre-#936 check](../design/diagnostics/map-critic-recheck-936/README.md):
  21 frames, `2878dfc`, evidence `7055ffa`; #918 merged, CI/review resolved.
- [Post-#936 check](../design/diagnostics/map-critic-post936/README.md):
  15 frames, `900d9a3`, evidence `29399f9`.
- [8 September survey](../design/diagnostics/map-critic-resume-0908/README.md):
  36 recipes, `mc-resume-01`, all sizes/biomes/settlements, `360778a`,
  evidence `3547686`; plus a second-seed building check.
- [Post-#937 check](../design/diagnostics/map-critic-post937/README.md):
  16 captures on `5040bd0`, evidence `37290a6`; old-setting controls were
  diagnostic overrides on the same scene, not old-build screenshots.
- [v0.2.13 pass](../design/diagnostics/map-critic-v0213/README.md):
  9 fence, 6 finding, 24 cutaway, 8 layer PNG pairs, three survey sheets
  and a native town corroboration; 51 PNG/sidecar pairs. 12 medium72 recipes,
  seed `mc-resume-02`, 24 source views all opened. Each record pins its runtime.
  [Digest](https://github.com/BenjaminBenetti/tut/issues/905#issuecomment-5592589635).

Docs PRs **#966, #971 and #1015 all merged**. #1015 merged at 22:25:47 UTC
as `123c54c71ec3be938fb9885f36f067bf557972fd`, with all CI green.
Docs-only PR **[#1049](https://github.com/BenjaminBenetti/tut/pull/1049)**
merged at 01:35:34 UTC as `ba4d7b1`; final head `5f4c4a6` passed all three CI checks.
[Completion record](https://github.com/BenjaminBenetti/tut/pull/1049#issuecomment-5594456162).
The merged survey passed local ESLint, Prettier and evidence validation:
26 PNG/sidecar pairs plus six separate landing-cost pairs, and 24 unique
survey recipes. Subsequent #1032/#1048 checks merged as **[PR #1057](https://github.com/BenjaminBenetti/tut/pull/1057)**
at02:49:36, squash `ffcf7ea`. Final head `afbb690` passed all three CI checks,
independently verified after resume. All26 new frames are committed and
posted. The deleted remote branch is finished. Tech Lead alone merges.

## Rulings and capture gotchas

Do not re-file **#876 or N1 narrow channels**. #813 permits bare natural
cliffs; dramatic town grades do not reopen judged connectors. #849 closed
with its wider coverage-bucket caveat. #869's crossed-kerb repair merged in #1063 at03:22:10, `c9b5631`.
MapGen explicitly approved eng-3's bounded repair in comment5594641108;
it clears only the half-wall crossed by an accepted ramp and preserves
pass order/fence inputs. The earlier move-kerbs-after-connectivity proposal
and pending-approval claim are superseded. Preserve #813/#876/N1 rulings.
#701 owns isolated desert palms; #712 records temperate boulder intent;
#281 cover density stands. Tree boundaries do not establish LOS protection (#591).

**#911 owns deploy/extraction dressing and placement.** Extraction stays
at deploy deliberately. The merged TDF dropship art was inspected as
constructed Art fixtures; it does not prove generated placement. MapGen
submitted real placement/boarding clearance in #1042, including an initial
tactical camera view from the ramp side after finding the south-facing craft
hid the starting rifle squad. Do not re-file the bare marker or that active
framing problem. Map Lab retains its common survey orientation.

Director accepted #1042 after its lot-cost answer; current accepted carry
is `a7e7a22`, still **open**. The frontage/drop-ship conflict was resolved;
unchanged PNG files alone do not prove the combined picture. First combined
gate exposed the pinned #1036 entrance fixture; MapGen derived the real
entrance and fixed that. Latest gate is red on the spawner/scout fixture:
a lone20HP squad reaches the objective wave and dies, not a landing-turn
wave. Owner is retaining the unseen→scout→click proof, deriving real movement
and using the normal starting roster; no seed or placement change promised.
Latest diagnosis03:21:42. Tech Lead still owes a fresh combined arrival
render and passing integration gate. Check actual release inclusion before
claiming dropships shipped. #984 deploy capacity is separately merged #1053.

MapGen answered that the aircraft reservation precedes building placement,
not deletion after generation. Its coastal/city/medium `mc-opening-03` pair
moves deploy from the west edge to the north-facing craft's boarding area
(x5–8,z8–11,y1) and changes10→9 buildings; it is not a same-deploy-position pair.
MapGen's own 108-map comparison reports a worst6→4 building change on
**coastal/city/small `mc-resume-02`**. Those counts are owner evidence, not Critic
QA work. After integration inspect that recipe for settlement identity/cost,
and the pictured city landing for approach, ramp visibility and squad framing.
The Critic has now rendered the largest-loss recipe on main9d9ea01 versus
isolated PRd4faaf9: six native frames, both sides/whole view, all opened.
Its thinner frontage is visible but remains a coherent coastal neighborhood;
the aircraft gives arrival/return a physical anchor. **Acceptable cost on
this recipe**, ranked below the four then-live defects. [Fresh preview record](../design/diagnostics/map-critic-premerge-0909/landing-cost/README.md).
No post-integration verdict or population-wide density judgment is claimed.

**Restart the capture server for every changed runtime baseline.** The
stable capture configuration disables watching/HMR, so an inherited server
can retain old modules after git checkout changes. The first two resumed
pilot frames from old port4173 were quarantined before judgement under
`excluded-stale-server/`; never publish them as v0.2.15. Fresh **port4175,
session78445** served the completed pass and is now stopped. `runtime.json` records its startup and
src/public/tools hashes. Reading git HEAD alone cannot certify cached code.

Map Lab: units-off removes coordinate projection; use initial framing.
Keep the **all** label for complete-building views; raw slider values can
mislead. Camera pitch means ground-axis pixels/tile. Actual cutaway uses
the roof-cutaway fixture; Map Lab preview presence alone is not its proof.
Tactical layers use ordinary campaign entry, no scene substitution. Use
settled individual keyboard taps; batch pan/edge clamping caused bad
framing before. Capture helper readiness is not itself visual acceptance.

Accepted PNGs are dated evidence at their named code/capture identity.
Never silently refresh them to follow later main. Same-run comparisons and
executable test baselines have distinct declared maintenance contracts.
No retouching or generated imagery is evidence. Retain incomplete/framing
pilots in scratch, excluding them from claimed counts.

## Watch and local checkpoint

One watcher: `.scratch/map-critic-v0216/watch.py`; live terminal identifier
in `watch/session.json`, cursor/deadline in `watch/config.json`. Window
**03:26:54 → 06:26:54 UTC9Sept**; every re-arm preserves that deadline.
It watches Discussion968, relevant merges, issue/body/label changes,
comments, PR review comments/reviews, owned docs CI, and v0.2.16 release/tag.
Full catch-up through03:22 is cached under `.scratch/map-critic-v0215/`:
`discussion-1068-catchup.json` (all100 window, no previous page),
`comments-1068-catchup.json` (2pages111comments), open/closed/release files.
The 03:31/03:34 cycles are consumed. A first rearm failed on an absent
history file and accidentally repeated a cycle after2m24s; helper now
initializes history, next cycle is03:39:19. Do not repeat that mistake:
**inspect rearm success before starting the watcher**.

```sh
gh api graphql -f query='{repository(owner:"BenjaminBenetti",name:"tut"){discussion(number:968){comments(last:10){nodes{createdAt body}}}}}'
```

Sample all channels before exit. Read every reported direction, including
all discussion posts without role mentions. If latest10 lacks overlap,
page catch-up before cursor advance. Resolve errors before rearm. REST
except this query; ≥300seconds; no second watcher or cron. Add new issues
and docs PR/current-head CI to this same config. Resolve this repository's
discussion ID afresh before mutations; never reuse an unverified node ID.

**Current CI caveat:** Tech Lead reported GitHub e2e20-minute cancellations
in #1070; eng-5 subsequently showed one17m06 successful run. Do not label
all cancellations superseded or all heads failed. The Tech Lead's full
combined local gate passed the merged #1063/#1064 tree. CI infrastructure
work is not ours; no test/assertion weakening. Evidence remains SwiftShader
under #1069, not the prospective iGPU path.

**v0.2.16 preparation only:** `.scratch/map-critic-v0216/`. Location catalogue
read from `src/overworld/data/earth-map.ts` solely to establish named claims:
Johannesburg/Lagos temperate cities, Perth coastal town. Verify on release;
never explain defects by reading generator code. Primary geographic
bookmarks are in `location-references.md`; no reference photos are licensed
or committed as game evidence. No location-specific finding yet.

**Excluded rolling main pass:** `.scratch/map-critic-v0215/rolling-survey/`,
12captures completed on `6a552d6` (mc-resume-04,small48:coastal town→desert
town→desert city→snowy city,near/rotated/whole). Individual inspection was
unfinished when Director required v0.2.16. `SUPERSEDED.txt` records scratch-only
status. Do not publish or count these as inspected release frames.
Port4177/session45251 is stopped; all previous capture servers are stopped.

Completed drivers/ledgers remain in `.scratch/map-critic-v0215/`: survey.mjs
(24recipes/48sourceviews),post1032.mjs (20frames),frontage-camera.mjs
(6frames, production camera accessor only), roof-controls and coastal
junction captures. Published README/sidecars give their exact invocation,
settings, crop, hash, runtime and limits. Earlier failed/framing pilots
remain scratch, excluded from counts. Archive of the prior detailed
handoff is [afbb690](https://github.com/BenjaminBenetti/tut/blob/afbb69008697c0a4e546decb4c45b5fffccfecd7/docs/handoff/map-critic.md).

Docs checks: `pnpm exec eslint . --ignore-pattern '.scratch/**'`,
`pnpm exec prettier --check . --ignore-path .prettierignore --ignore-path .gitignore --ignore-path .git/info/exclude`,
`git diff --check`; validate PNG dimensions/hashes, recipes, links and scope.
No game tests for diagnostic-only edits; normal PR CI applies. System Python
has no Pillow; PNG headers/stdlib suffice for dimensions. Never retouch proof.

Avoid negated GitHub closing phrases (#906 was once accidentally closed).
Use References for live findings, including epic1068; docs may reference the
already-closed survey905 for the template. Every comment has the Critic
header. No main push, game code/art changes, merges, model switching or QA
counting. Only this repository/workspace.
