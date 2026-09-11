# Map variety and environmental realism

One iterative review for #1110. Baseline: `5008477`. All close-up pairs use the
same seed, place profile, viewport, camera, and real production models. Images
come from Map Lab; the live-mission image additionally shows the gameplay HUD
and fog of war.

## Initial critique

- Normal three- and four-lane streets reject street prop placement because
  adjacent carriageway lanes are mistaken for intersections. The baseline
  city (`mc-resume-01`) has 14 buildings and 435 props, but no cars, dumpsters,
  barriers, or sandbags. The town and desert controls also have no road props.
- Registered lamp-post and hydrant models are unused. Pavements have no
  small-scale infrastructure to establish street rhythm.
- Mirrored exterior ground-floor walls lose their building ownership outside
  Johannesburg, producing repeated brick bases even where the upper floors
  use a different wall family.
- Yard groups and repeated vegetation silhouettes need variation while keeping
  doors, windows, hooks, and traversal clear.

## Reproduce the close-ups

The committed case list covers city, town, snowy rural, desert town, Perth,
and Lagos. The `control` flag preserves each place profile in **both** phases.
The capture tool checks page errors and failed model loads and records the
camera and image hashes alongside the PNGs. It can repeat each frame in a
fresh browser to check capture stability.

```sh
PLACE_OUTPUT=docs/design/diagnostics/1110/after \
PLACE_MAP_OUTPUT=/workspaces/tut/.git/map-variety/maps \
PLACE_CASE_FILE=tools/mapgen/map-variety-cases.json \
CAPTURE_REPEATS=1 node tools/mapgen/capture-place-profiles.mjs after
```

For the baseline, set `PLACE_ROOT` to a detached worktree at `5008477`, change
the output directory to `before`, and pass `before` as the phase. Dependencies
must be available in that worktree. Set `CAPTURE_CASES=city` for one case, or
`CAPTURE_REPEATS=2` to verify a frame in two independent browsers.

```sh
CAPTURE=1 pnpm exec playwright test e2e/map-variety-screenshot.spec.ts --workers=1
```

The second command captures a city overview and a mission reached through
the real deployment flow, with asset fallback guards.

## Review criteria

Street assets must follow the carriageway direction and leave intersections,
doors, ramps, and bypass lanes clear. Small sidewalk fixtures must inherit
their tile's fog. Yard variants must stay within the existing cover budget.
Vegetation must remain rooted and inside its supported footprint. Building
finishes must be consistent across mirrored exterior walls and preserve local
place identities. Generation must remain deterministic and pass the map
invariant sweep; restored road cover is also checked in the mission simulation.

Implementation results and validation will be recorded here as the critique
and implementation passes complete.
