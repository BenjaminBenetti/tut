# Jev navigation on real game maps

**The useful simplification is to remove tile-level pathfinding from Jev’s question.** Let Jev choose a destination from the orders, then let the game compute and execute one AP of movement. Ask again afterward. Removing combat fields, coordinate rulers or the global map alone did not reliably stop loops.

This is an evaluation and a working prototype in `tools/jev/`, **not a change to the live game controller**. It establishes movement toward named objectives, not general combat intelligence.

Run on 2026-09-22 with pinned `jev-1.13.0`, using game code at `6a2d02dd`. There were **94 trajectories, 1,718 API requests and 1,415 applied movement commands**, across **12 distinct generated maps**. These totals include development failures and repeated validation; they are not 94 independent maps. Offline replay verified every applied command, AP charge, outcome, distance score and request hash.

- [Interactive route viewer](index.html): choose experiment, map, method, elevation and decision attempt. This standalone file opens directly in a browser.
- [Machine-readable results](results.json): every experiment’s cases and aggregate metrics.
- [Complete trace archive](traces.tar.gz): exact requests, raw responses, request IDs, timings, map geometry and per-decision traces, including failures. Authentication headers and API keys are excluded.
- Exact sample requests: [current](sample-current.json), [lean flat](sample-lean-flat.json), [route costs](sample-route-cost.json), [objective choice](sample-goal-route-doors.json).

## Held-out results

The final methods were fixed before evaluating two unused seeds at each shipped size: **48×48, 72×72 and 96×96**. Each method ran the same six maps, once with full visibility and once with normal faction fog where applicable. The actor was the shipped rookie Rifle Squad: movement 5, AP 2, sight 12. The order was always `Reach objective-N as quickly as possible.`, with an empty commander prompt. `N` was the farther of the map’s two generated objectives by actual route distance. Both objective choices remained available in the intent prototype.

| Method | Full visibility: reached | Faction fog: reached | Mean input tokens/request, full / fog |
|---|---:|---:|---:|
| Current production movement question | 0/6 | 0/6 | 19,606 / 7,425 |
| Reduced state, flat destination choices | 0/6 | 1/6 | 17,456 / 7,224 |
| Game-computed route distance per destination | 6/6 | Not tested: requires a connected known route | 3,087 / — |
| Jev chooses objective; game routes and explores | **6/6** | **6/6** | **379 / 379** |

The current full-visibility run had **five loops and one 20-second API timeout**. The timeout was retained as a service failure and not retried; it is not counted as a demonstrated navigation loop. Every other unsuccessful held-out trajectory looped. Mean token counts above use calls with reported usage; the archived early summary counted the timed-out request as zero tokens, yielding 19,501 instead of 19,606 for that one cell.

All fully revealed successes used the optimal AP. With fog, the final prototype spent 85 AP against an **80-AP omniscient lower bound** across the six maps: 6.25% aggregate overhead, or 9.72% when averaging the six per-map ratios. Exploration can require extra movement; this is not a comparison against an optimal fog policy. Reversing the objective-choice order in a separate repeat also reached **6/6**, with the same AP totals.

| Held-out map | Size | True shortest route, tiles | Minimum AP | Prototype AP, full / fog |
|---|---:|---:|---:|---:|
| Temperate city, seed 1 | 48×48 | 34 | 7 | 7 / 9 |
| Temperate city, seed 1 | 72×72 | 71 | 15 | 15 / 15 |
| Temperate city, seed 1 | 96×96 | 102 | 21 | 21 / 22 |
| Coastal town, seed 2 | 48×48 | 40 | 8 | 8 / 10 |
| Coastal town, seed 2 | 72×72 | 32 | 7 | 7 / 7 |
| Coastal town, seed 2 | 96×96 | 107 | 22 | 22 / 22 |

The prototype’s mean HTTP latency was 113 ms with full visibility and 100 ms with fog. Those numbers exclude map generation, request preparation, local pathfinding, animation and relay overhead. It selected the ordered objective on every held-out call. That demonstrates a narrow intent-selection task; **the game, not Jev, solved the routes**. An explicitly supplied objective ID would not require an AI call at all. In the actual feature, Jev’s useful role is interpreting orders and choosing among tactical intents.

## What was removed and what changed

The first pilot used the same three maps for seven methods:

| Method | Change from current | Reached |
|---|---|---:|
| `current` | Exact production movement state, instructions and destination grouping | 0/3 |
| `lean-state` | Remove HP, weapons, equipment, other mission context, rulers and repeated prose; retain destination grouping | 0/3 |
| `lean-flat` | Also remove grouping and verbose destination previews; offer all legal destinations directly | 1/3 |
| `coordinates` | Also remove the map; retain actor, objective and destination coordinates | 1/3 |
| `local` | Use only nearby 17×17 terrain, blocking edges and elevation links | 0/3 |
| `relative` | Remove map and absolute coordinates; express goal and moves relative to actor | 0/3 |
| `route-cost` | Replace map with remaining walkable route distance computed by the game | 3/3 |

The reduced formats were ablations of several related fields, not an experiment isolating each word. `lean-state` also changes instructions, and `lean-flat` changes option descriptions as well as grouping. Their results support a workflow change, not a claim that one field caused all failures.

On the second development seed at all three sizes, current and lean-flat each reached 0/3; computed route costs and objective selection each reached 3/3. Full state often sent roughly 15–20k tokens for a movement question and repeated it during group selection. Shorter tile-choice inputs could still walk toward the objective’s coordinates and then alternate between two positions at a wall. There is no evidence here that more spatial prose would fix this reliably.

The final prototype sends this complete request:

```json
{
  "model": "jev-1.13.0",
  "state": {
    "entity_prompt": "Reach objective-1 as quickly as possible.",
    "commander_prompt": ""
  },
  "questions": {
    "action": {
      "type": "choice",
      "instructions": "Which destination should this actor move toward to follow its orders? The game handles pathfinding around obstacles using faction knowledge, exploring when needed. This move spends 1 AP; you choose again afterward.",
      "criteria": {
        "objective-1": "Move toward objective-1.",
        "objective-2": "Move toward objective-2."
      }
    }
  }
}
```

This removes the map and the dozens of tile alternatives from the model request. It changes who does the routing; it does not show that Jev independently learned to navigate from less map data. The separate route-cost control makes that distinction explicit. It also follows the [TypeSafe guidance](https://docs.typesafe.ai/concepts/how-to-build-with-system-one) to keep deterministic calculations in code and use the model for a bounded judgment.

## Fog revealed a missing action

On the first development 72×72 city, a shortest route crosses from `(22,2,12)` to `(22,2,11)` through a door. The exterior tile and door are observed, but the interior tile is hidden because doors block sight. The normal Jev movement graph contains only observed or remembered surfaces, so **crossing that door is absent from its choices**, even though the real movement handler accepts it. A prompt cannot repair this missing candidate.

The first intent-routing prototype still reached only 3/6 development objectives under fog. Two failures involved inaccessible hidden interiors; another wasted moves exploring apparent frontiers along elevation changes. All those traces are retained under `navigation-dev-goal-fog`.

The final experimental planner:

1. Uses the existing movement search on faction-filtered terrain. Neither the request builder nor the planner receives the scoring oracle.
2. Routes toward a reachable exploration boundary when the objective is not connected to known terrain. It remembers exhausted boundaries and updates its target when knowledge changes.
3. Can hypothesize **one infantry step beyond an observed door**. It truncates movement at the first unknown cell; it does not inspect hidden terrain to establish that the hypothesis is true.
4. Submits that attempted move to the normal game validator. A refusal is logged and excludes that hypothesis from further attempts; it spends no AP. A successful move updates visibility normally.

The first door prototype reached 5/6 development objectives; the remaining map correctly rejected a hypothesized step. After adding refusal handling, that case reached the objective in 32 AP against a 20-AP fully revealed lower bound, including one rejected attempt. The earlier failure is retained separately, not overwritten. The final held-out fog cases needed no rejected attempts.

Unit tests verify that changing a hidden cell from walkable to blocked produces exactly the same prototype request and proposed action. Only the actual attempted command reveals the difference. A second test reproduces the opaque-door candidate gap and the one-cell exploration behavior. These exploration rules are deliberately limited to this infantry navigation prototype; they are not a finished movement policy for every game entity.

## Evaluation contract and limits

- Maps come from `generateTacticalMap`, using actual deployment and egg-spawner hooks, terrain, walls, buildings, elevation and connectors. Development seeds are `730982385` and `3677615265`; held-out seeds are `jev-navigation-holdout-1` and `jev-navigation-holdout-2`.
- The actor is a real roster-created rookie rifle squad. The tactical fixture helper supplies only empty mission bookkeeping. No enemies, enemy turns, hazards or infestation are present. Arrival at the objective tile ends the navigation task; destroying the nest is outside scope.
- Action-type selection is fixed to movement for every method. The `current` baseline is the exact production movement follow-up, with the model pinned for comparison; it is not a complete autonomous mission benchmark.
- Every applied move goes through the real move handler and spends exactly one AP. AP refreshes after two moves. Faction vision and remembered terrain are refreshed after each move in fog trials.
- Success means reaching the exact objective tile. Episodes stop after four visits to the same position and knowledge/refusal state, after `2 * optimalAP + 10` spent AP, or on an error. The final runner also bounds attempted decisions at four times that AP cap. A finite cap does not prove an episode could never recover later.
- All ordinary tile-choice variants retain every legal candidate. The intent variants replace the tile-choice action space with objectives; they are **explicitly assisted comparisons**, not a pure prompt change. The door variant additionally permits the described uncertain step attempts.
- Offline full-map distances score progress and set the AP cap. They are not passed to unassisted formats or the fog planner. The route-cost control separately computes distances on the perceived map and requires a connected known goal. Uniform infantry costs are asserted so the full-map AP minimum is exact.
- Requests use `JevKey` server-side from `.env`, never a browser credential. There are no inference retries, confidence thresholds or post-response substitutions. The API’s selected option determines the executed action or selected route. Candidate insertion order is preserved except in the explicit reversed-order check.
- The held-out sample is six maps per visibility condition. Development tuning, one actor type and a simple explicit order limit generalization. Combat, following named allies, dynamic terrain, unseen blockers, multi-tile bugs, mechs, weighted costs, unreachable objectives and conflicting commander orders need separate evaluations before broader integration.
- The saved experimental batches precede some tooling cleanup. In particular the first failed door version aborts on a rejected step; the final runner remembers and continues. The exact historical requests/responses remain the record of those runs.

## Reproduce

Use Node 24 (native TypeScript transformation) and the repository dependencies. `JevKey` must be present in `.env` for live evaluations. Each live command below makes paid API requests, with its explicit request budget. Use a fresh output directory for each experiment.

```bash
# Generate real cases and inspect dimensions without calling Jev.
node --experimental-transform-types tools/jev/evaluate-navigation.mjs \
  --suite=holdout --vision=fog --dry-run --out=.producer/jev/nav-dry

# Verify the fully revealed pathfinding control without calling Jev.
node --experimental-transform-types tools/jev/evaluate-navigation.mjs \
  --suite=holdout --vision=full --oracle --variants=current \
  --out=.producer/jev/nav-oracle

# Re-run the held-out full-visibility comparison.
node --experimental-transform-types --env-file=.env tools/jev/evaluate-navigation.mjs \
  --suite=holdout --vision=full \
  --variants=current,lean-flat,route-cost,goal-route-doors \
  --max-requests=500 --out=.producer/jev/nav-full-repeat

# Re-run the held-out fog comparison.
node --experimental-transform-types --env-file=.env tools/jev/evaluate-navigation.mjs \
  --suite=holdout --vision=fog --variants=current,lean-flat,goal-route-doors \
  --max-requests=500 --out=.producer/jev/nav-fog-repeat

# Check order sensitivity without changing the prompt or maps.
node --experimental-transform-types --env-file=.env tools/jev/evaluate-navigation.mjs \
  --suite=holdout --vision=fog --variants=goal-route-doors --reverse-choices \
  --max-requests=150 --out=.producer/jev/nav-reversed-repeat

# Validate the harness without network access.
pnpm exec vitest run tools/jev/navigation-eval.test.mjs

# Replay the committed archive without calling Jev.
mkdir -p .producer/jev/nav-recorded
tar -xzf docs/experiments/jev-navigation/traces.tar.gz -C .producer/jev/nav-recorded
node --experimental-transform-types tools/jev/verify-navigation.mjs \
  .producer/jev/nav-recorded/navigation-*

# Generate a standalone viewer and summary for new experiment directories.
node tools/jev/render-navigation-report.mjs \
  .producer/jev/nav-full-repeat .producer/jev/nav-fog-repeat \
  --out=.producer/jev/nav-viewer
```

`--cases=holdout-1-large` selects a case; `--repeat=N` repeats matched episodes. Other variants are `lean-state`, `coordinates`, `local`, `relative` and the earlier `goal-route` planner. These are experimental tools, separate from relay operation and the development inspector.

For game integration, preserve action-type selection, commander/entity orders and the fresh decision after each AP. Replace movement’s region/tile questions with a small set of meaningful destinations or intents. Keep pathfinding and exploration in code, retain the observed-door fix, and expose the selected intent, route, knowledge boundary and rejected attempts in the inspector. Expand the evaluation to actual combat decisions before removing tactical facts that those decisions need.
