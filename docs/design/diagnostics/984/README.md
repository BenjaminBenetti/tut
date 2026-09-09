# #984 — deployment capacity is a map guarantee

[Cause recorded before production edits](https://github.com/BenjaminBenetti/tut/issues/984#issuecomment-5594293169).
Baseline `1b0ff8d`; repair runtime `53f6cea`.

The old I6 validator accepted four mech spaces and eight infantry spaces while legal
forces can contain eight mechs. The real placement path consumes each coordinate once.
A minimally accepted map could therefore refuse a legal launch on its fifth mech. The
current generator normally gives sixteen shared spaces, concealing the contract error.

## Counterexample and repair

The regression builds a flat 8×2 map with eight connected deploy coordinates: four
admit both classes and four infantry only. Extraction and edge-spawn hooks are valid.
The deploy hook requires infantry; I6 separately promises mech capacity. The default
mission hook requests both classes, which also protects today's generated case. This
fixture demonstrates what the general contract accepts, not a live campaign failure.
The deployment has eight distinct mechs using real starter loadouts. Only map generation
is substituted at the mission-start boundary; the real unit-placement/claim path runs.

On the old validator, this exact map has zero violations and mission start returns
`no-deploy-room` for `capacity-mech-4`. The final regression retains that defensive
launch assertion and requires I6 to reject the insufficient map; it failed against the
old validator because the received violations were empty. A second failure demonstrates
that eight hook entries repeating four coordinates also inflated old capacity counts.

Both class floors now derive from the existing `MAX_DEPLOYED_UNITS` (eight), and
capacity counts distinct indexed tiles. ADR 0004 I6, the placement doc comment and the
cap's obsolete sixteen-tile guarantee are reconciled. The current sixteen-tile placer
target and gameplay limit remain unchanged; launch guards still defend malformed maps.
A future generated zone below either floor fails generation instead of reaching placement.

The control is an eight-shared-tile zone. All nine legal full-deployment class mixes
(0–8 mechs, remaining units squads) validate and launch with eight distinct unit positions.
Additional cases reject one missing space for either class. The existing generated-map
capacity control in the mission-start suite remains in place.

## Generated-map preservation

The independently executed [before](before.jsonl) and [after](after.jsonl) sweeps cover
four biomes × three settlement scales × three sizes × `mc-resume-01/02/03`: 108 maps.
Every row records the runtime commit, complete-map SHA-256 and distinct per-class zone
capacity. The after command asserts complete-map and zone equality against the baseline;
it fails rather than writing a successful comparison when any pair differs.

**All 108 complete-map hashes match; every zone remains sixteen distinct tiles,
all admitting both classes.** Typecheck/lint/build and 60 targeted tests pass.
The full unit suite passes **2,277 tests** (one skipped) with two workers and
unchanged timeouts. The first unrestricted run hit three existing sweep timeouts.
The first browser suite passed 61 tests but its two-mount capture equality test
exceeded its unchanged 120-second budget. A two-worker full rerun timed out that test
and an end-turn test whose page returned to the menu during navigation. Both affected
tests then passed together in an isolated one-worker run (1.9 minutes), with all
assertions and timeouts unchanged. Every one of the 62 ordinary browser tests has a
passing result on this code; a clean single full-browser invocation is not claimed.
The normal current-head CI gate remains required before merge. This is a contract
repair, not a visual layout change; no PNG is presented as evidence of an unaltered screen.
The complete-map hashes and unchanged renderer/assets establish the preservation claim.

```sh
# Run the first phase against an independent baseline checkout.
SURVEY_SOURCE_ROOT=/absolute/path/to/baseline node tools/mapgen/survey-deploy-capacity.mjs before.jsonl
node tools/mapgen/survey-deploy-capacity.mjs after.jsonl before.jsonl
pnpm exec vitest run src/tactical/service/mission-start-service.test.ts src/mapgen/service/map-validator.test.ts
```
