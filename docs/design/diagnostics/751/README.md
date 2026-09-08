# #751 — explain the actual defeat condition

The outcome service ends a campaign at global threat 100. Its city-loss count
measures cities at infestation 100. Threat also includes time escalation and
event offsets, so zero lost cities is compatible with defeat. The old headline
claimed Earth was overrun without establishing that from the map.

The panel now says **Threat limit reached** and **Global threat reached 100,
ending the campaign.** The threshold comes from `MAX_THREAT`. The outcome rule,
statistics, save shape, tuning and victory presentation are preserved.

## Evidence

Baseline: `b6928d0c74772e4e558a766d0f04c7cb307b260f`. Application and capture
code: `ff939e3`. The before and after folders record the source revisions,
fixture parameters, viewport, actual outcome snapshots and PNG SHA-256 hashes.
Both versions were built with Vite and rendered in Chromium with SwiftShader.
All four frames were opened and inspected.

| Case | Before | After |
| --- | --- | --- |
| Defeat with zero cities lost | [Frame](before/defeat.png) | [Frame](after/defeat.png) |
| Victory control | [Frame](before/victory-stub.png) | [Frame](after/victory-stub.png) |

Both cases start from a seed-751 campaign. The capture tool constructs map
snapshots, computes threat with the shipped tuning, and runs `applyOutcome`.
It then loads that saved outcome through Continue in the built application;
the real screen renders the frozen statistics.

- **Defeat:** every city is at 70 infestation on day 300. Mean infestation 70
  plus capped escalation 30 yields threat 100; cities lost is 0/37. The unit
  regression also checks day 299 remains in play. This is a boundary fixture,
  not a campaign-length measurement or a replay of the historical ten-day report.
- **Victory control:** every city is clean, no hives remain, day 41. The same
  screen renders the existing victory text, statistics and bright backdrop.
  Its before/after PNGs are **byte-identical**, SHA-256
  `368d10e994f7b7ecb7d23d18475a388ec5c7166db2125f32b76842f72c155bba`.

Both outcome snapshots are identical before/after. The defeat caption uses one
line where the old caption used two, making the centered panel slightly shorter.
The heading, explanation, statistics and menu button remain readable.

## Reproduce and verify

Build each revision and serve it with `pnpm exec vite preview --port 4183
--strictPort`. From the implementation checkout run:

```sh
CAPTURE_BASE_URL=http://localhost:4183 node tools/ui/capture-game-over.mjs before
CAPTURE_BASE_URL=http://localhost:4183 node tools/ui/capture-game-over.mjs after
cmp docs/design/diagnostics/751/before/victory-stub.png docs/design/diagnostics/751/after/victory-stub.png
```

The first command targets the baseline build; the second targets the new build.
Keep a baseline build under `node_modules/.cache/` if serving both revisions.
The control comparison must succeed exactly, without a pixel tolerance.

Validation: typecheck, lint, **2,179 unit tests**, build, **7 simulations**, and
`CI=1 pnpm test:e2e e2e/game-over.spec.ts --repeat-each=3` (**3 passed, no retries**).
The regression failed on the old headline before the text change. The browser
test uses the existing accelerated-threat option and also asserts zero cities
lost; it is not a pacing measurement.

## Recommendation for the Director

Ship the factual wording against the existing GDD §5.3 rule. If the intended
ending must instead establish that Earth has been overrun, decide a city-loss
condition or a retuned threat curve against an agreed loss target and fresh
campaign measurements. That larger design choice does not block this correction.
