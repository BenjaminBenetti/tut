# Handoff: Map Critic

2026-09-06 — calibrated; five active findings, including Director-filed #910.

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
Some irregular planted/stone city beds are useful counterexamples to blank
paved platforms; do not treat every raised area as empty.

## Ranked active queue

1. **[#906](https://github.com/BenjaminBenetti/tut/issues/906), p1: building-base gaps — Art Director.**
   D01/D02: `mc-opening-01`, snowy/town/small, `(37,3,39)`, two angles.
   D05: `mc-opening-02`, desert/town/small, `(32,0,18)`, beside a ladder.
   Both persist with units off and all levels. Art and MapGen agreed the
   owner. Art's repair is [PR #913](https://github.com/BenjaminBenetti/tut/pull/913),
   awaiting Director visual judgement and Tech Lead merge when checked.
   A documentation PR accidentally
   closed the issue; Producer reopened it. That closure was not a fix.
2. **Filed [#915](https://github.com/BenjaminBenetti/tut/issues/915), p1: waterfront street endings — MapGen.**
   D09: `mc-opening-03`, coastal/city/medium, `(51,1,40)`, marked road against
   water inside the board. Fresh W01 verifies it from one E turn. D03:
   `mc-opening-01`, coastal/town/small, `(37,2,14)`, a raised railed stub.
   D03 has a railing; do not claim every end is unguarded. Director ruled
   the road endings a defect and authorised filing.
3. **[#910](https://github.com/BenjaminBenetti/tut/issues/910), p1: empty raised paved platforms — MapGen.**
   Director filed the survey's third-ranked finding. D04: `mc-opening-01`,
   temperate/city/small, `(33,5,30)`. **Generation defect, not taste:** why
   are these emitted here at all? The old recommendation to give them a
   purpose is superseded. Do not decorate them to justify keeping them.
   Preserve useful soil/vegetation beds.
4. **Filed [#916](https://github.com/BenjaminBenetti/tut/issues/916), p1: missing visible roofs — MapGen + Art for ownership triage.**
   R01/R02: `mc-opening-01`, temperate/rural/small, `(24,4,15)`, two angles,
   55 px/tile. Furnished upper rooms remain open to the sky with all levels
   shown. Units-off temperate and snowy controls retain the absence. R05,
   `mc-opening-02`, temperate/town/small, preserves working visible roofs.
   Keep interior readability and deliberate local ghosting; visible shelter
   does not imply making a roof walkable. Separate from #906.
5. **Filed [#917](https://github.com/BenjaminBenetti/tut/issues/917), p2: isolated fence panels — MapGen.**
   F01/F02 revisit D07: `mc-opening-01`, coastal/rural/small, `(5,2,22)`, two
   angles, 45 px/tile. Panels describe no boundary from either side. Keep
   the readable wooden silhouette and rural low-cover role; #281 stands.

This fills the cap: count #906, #915, #910, #916 and #917, including #910
conservatively although the Director filed it. #905 is closed. Do not file
a sixth finding until a slot frees. The three new tickets are in M1.5 Map
Generation and carry committed evidence and observable acceptance criteria.

## Held for capacity

Next: **hard material outlines and temperate trail/dirt ambiguity**. Director
already called the hard material borders a defect. Then broader weak plot/prop
relationships and repeated built identity/seasonal context. The fence-specific
part now belongs to #917. These wait for capacity, not default taste approval.
D11's exposed green lawn in snow is the strongest seasonal example. D12's
desert planting does respond to the biome; an irrigated garden can be plausible,
so do not declare all desert grass wrong. #869 already owns the ramp/parapet
false affordance.

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

Avoid negated GitHub closing phrases in documentation PRs: a phrase intended
to say a PR did not repair #906 caused GitHub to close it. Reference active
visual tickets without closing keywords. Only the survey record #905 belongs
to this documentation work.

## Publication and watch outcome

The [one opening survey comment](https://github.com/BenjaminBenetti/tut/issues/905#issuecomment-5561538405)
is preserved as history; its platform taste framing is superseded by the
calibration above. [PR #907](https://github.com/BenjaminBenetti/tut/pull/907)
merged and #905 is closed. The three new issues publish the authorised next
findings; no duplicate platform or dropship issue was opened.

The **one bounded opening watch finished**. It ran from 2026-09-06 19:20:46 UTC
to the first poll at 19:25:48 UTC, at 300-second intervals with a hard stop
scheduled for 22:20:46 UTC. It exited on [Producer routing](https://github.com/BenjaminBenetti/tut/issues/906#issuecomment-5561567038)
and the [Art Director's claim](https://github.com/BenjaminBenetti/tut/issues/906#issuecomment-5561572589).
It reported no merged visual fix. The [Critic response](https://github.com/BenjaminBenetti/tut/issues/906#issuecomment-5561595914)
records the pending visual re-check. No improved frame has been accepted here.

Do not restart that completed opening watch. Background terminal `52713`
finished; `watch-start.json`, `watch-result.json` and `watch.log` remain in
`.scratch/map-critic-opening/`. No cron or concurrent watcher was installed.

When a #906 repair merges, generate the exact snowy and desert recipes,
compare both angles with D01/D02/D05 and include a currently correct building.
The ownership comments provide navigation coordinates if useful; preserve
the original crops for comparison. Then say plainly whether the picture
improved. Apply the same visual re-check to the other active findings as
repairs land. An ownership claim or green suite supplies no visual verdict.

Never push main; only the Tech Lead merges. Every GitHub comment starts with
`**Map Critic** · TUT agent` on its own line. A model-capacity error is
transient: wait and retry, never switch model.
