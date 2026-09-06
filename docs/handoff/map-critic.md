# Handoff: Map Critic

2026-09-06 — opening survey complete; publishing the assessment and first ticket.

The Executive Director requested this first survey for calibration. Exactly
one new actionable ticket is selected. The opening assessment is a separate
record; count it conservatively toward the three-open-ticket cap.

## Evidence and judgement

All 108 Map Lab recipes were visually inspected: four biomes × rural/town/city
× 48/72/96 × `mc-opening-01/02/03`. Each has a whole-map and closer view;
all 36 large-map whole views were also inspected at native resolution.
The [evidence index](../design/diagnostics/map-critic-opening/README.md),
[assessment](../design/diagnostics/map-critic-opening/assessment.md), and
[visual ledger](../design/diagnostics/map-critic-opening/visual-ledger.md)
record the method, exact recipes, tile focuses and observations. There are
27 comparison sheets and 13 detail/control PNG views with JSON sidecars.

Baseline is `cafd9ff`, after #813, #826 and #891. Work branch:
`docs/900-map-critic-opening`. Only diagnostic documents/images and this
handoff changed. No generator implementation was reviewed. No prevalence,
movement, LOS, balance or performance claim is made. QA owns systematic
counts if the studio needs them. Capture scripts and source frames remain
in `.scratch/map-critic-opening/`, excluded from Git.

Preserve the clear carriageway/pavement/door proportions, readable rooms off
corridors, warehouse/small-building contrast, materialled ladders, and the
real changes in hills, vegetation, height and coast orientation between seeds.
Some irregular planted/stone city beds are useful counterexamples to blank
paved platforms; do not treat every raised area as empty.

## Ranked queue

1. **Selected for the sole first ticket: buildings over black base gaps.**
   D01/D02: `mc-opening-01`, snowy/town/small, focus `(37,3,39)`, two angles.
   D05: `mc-opening-02`, desert/town/small, `(32,0,18)`, beside a ladder.
   Both persist with `units=0`, models on, all levels. This is separate from
   D08's intentional `floor=0` interior cut. Route to both MapGen and Art;
   the render establishes the symptom, not its implementation cause.
2. **Held: waterfront street endings.** D09: `mc-opening-03`,
   coastal/city/medium, `(51,1,40)`, marked road directly against open water
   inside the board. D03: `mc-opening-01`, coastal/town/small, `(37,2,14)`,
   a raised railed stub with no destination. There is a railing in D03;
   do not claim every end is unguarded. Recommend this next after grounding,
   subject to the Director's calibration.
3. **Held: empty raised city platforms lack a readable purpose.** D04:
   `mc-opening-01`, temperate/city/small, `(33,5,30)`. Preserve useful high
   ground, but seek a recognisable neighborhood function. This is a taste
   decision, not permission to prescribe an asset or generation algorithm.

Lower in the assessment: existing #869's ramp/parapet false affordance;
hard material outlines and temperate trail/dirt ambiguity; isolated fences
and weak plot/prop relationships; repeated built identity and seasonal
context. D11's green lawn in snow is the strongest seasonal example.
D12's desert planting does respond to the biome; an irrigated garden could
be plausible, so do not declare all desert grass wrong. Do not file these
as more day-one tickets.

## Rulings and prior work

Do not re-file #876 or N1. The #813 allowance for bare unpaved cliffs stands;
severe-looking road grades in snow do not reopen judged connector geometry.
#849 was closed when checked, with the wider coverage-bucket caveat retained.
#869 already owns city ramps crossing unbroken parapets. #701 owns isolated
desert palms; #712 records temperate boulder intent; #281 rules to retain
cover density. The prop-context concern is not a request for more cover.

The final pre-filing issue search found no building-base-gap duplicate.
Recent merged PRs since the survey baseline changed process/handoffs only.

## Publication and watch

Issue and PR links will be added immediately after filing. No watch has
started at this commit.

Run **one** background terminal watch, every five minutes, for a newly
merged MapGen/Art PR or a comment on either owned issue. Resolve area from
the PR labels or its explicitly linked work issue because recent PRs often
have no area labels. Documentation-only PRs are not visual fixes. Exit on
the first change; hard stop after three hours. The prepared scratch
`watch.py` records its start and result in JSON and emits only on change,
timeout or API trouble. No cron and no second loop.

Re-render a merged visual fix at the exact affected recipe, compare it with
the committed baseline crops and say plainly whether the picture improved.
If the trigger is only a comment, handle the feedback and do not imply a fix
has landed. Keep the evidence PR draft while the watch outcome is pending;
append the outcome and mark it ready when this bounded task finishes.

Never push main; only the Tech Lead merges. Every GitHub comment starts with
`**Map Critic** · TUT agent` on its own line. A model-capacity error is
transient: wait and retry, never switch model.
