# Jev navigation with 100 entities

This replaces the earlier two-objective report with crowded-map evaluations. Every request contains **100 other entities, all 100 destination choices, the actor’s metadata and both order prompts**. Jev chooses the entity to approach; the game computes and executes one AP of legal movement, then asks Jev again.

- [Interactive evaluation website](index.html): maps, all unit footprints, orders, target choices, routes, exact requests and raw responses. Click a unit for its metadata; step through individual decisions or download their requests. The page also works as a standalone file in a current browser.
- [Results JSON](results.json): every batch, case definition and aggregate result.
- [Complete trace archive](traces.tar.gz): exact requests, responses, request IDs, timings, map geometry and command traces, including failures. No credentials or authentication headers.
- Sample requests: [shared capabilities](sample-entities-shared.json), [inline capabilities](sample-entities-inline.json).

With `./run.sh` running, open **http://localhost:5173/docs/experiments/jev-navigation/index.html**.

## Results

**Shared capability definitions retained all metadata and reached every target in the main comparison.** Repeating the same capabilities in each entity record was less reliable, particularly when an order depended on remaining equipment.

| Format | Reached, six maps × four orders | Correct target choices | Mean input tokens / request | Mean HTTP latency |
|---|---:|---:|---:|---:|
| Inline capabilities | 19/24 | 409/426 (96.0%) | 28,235 | 326 ms |
| Shared capabilities | **24/24** | **474/474 (100%)** | **17,157** | **223 ms** |

The shared format used **39.2% fewer input tokens**. All 24 shared trajectories used the exact minimum AP, totaling **474 AP**. All successful inline trajectories were also optimal; the other five arrived at the wrong unit. Neither format hit an API token limit in these runs.

| Order type | Inline reached | Shared reached |
|---|---:|---:|
| Named friendly unit | 6/6 | 6/6 |
| Named hostile unit | 6/6 | 6/6 |
| Radio Squad with one radar dish remaining | **1/6** | **6/6** |
| Commander overrides individual order; find lowest-HP Medic Squad | 6/6 | 6/6 |

The equipment failures were not illegal paths. Jev sometimes selected the right squad initially, then switched to a different Radio Squad with three dishes remaining. The game correctly executed those wrong choices. For example, `holdout-1-large-equipment` repeatedly chose Juliet-06 instead of Foxtrot-04, ending with confidence 0.81. Confidence did not guarantee correctness.

The separate three-map pilot reached **10/12** with inline capabilities and **12/12** with shared capabilities. Its two inline failures were also equipment orders; both remain in the viewer and archive. No prompt revisions were made after those runs to hide the failures.

Reversing all 100 options in a separate repeat also reached **24/24**, with **474/474 correct choices** and the same optimal **474 AP**. Its mean request size was again 17,157 tokens, with 228 ms mean HTTP latency. Across pilot, comparison and reversal, the shared format reached **60/60** with **1,184/1,184 correct choices**. These are repeated trajectories on nine maps, not 60 independent maps.

The replacement report contains **96 trajectories, 1,829 live API calls and 1,822 applied one-AP movement commands**, across **nine distinct generated maps**. There were seven wrong-destination failures, all in the inline format, and no API errors or retries. Offline replay verifies every saved request hash, the full production metadata, all 100 choices, target accuracy, command legality, AP charge and final score.

The result supports **removing duplicated capability data**, while keeping all entities, current conditions and choices. It does not establish general combat performance or navigation under fog.

## What Jev receives

Both formats contain the same production metadata, projected through the game’s faction observation code:

- **Actor:** name, type, faction, position, facing, HP, armor, footprint, weapon profiles, equipment and its available AP, movement and weapon resources.
- **100 entities:** distinct names and IDs, types, factions and relationships, coordinates/elevations, facing, HP, armor, footprints, weapons and status. Friendly units additionally carry their AP, movement, charges and remaining equipment. Enemy private resources remain omitted, as in the game.
- **Orders:** `entity_prompt` and `commander_prompt`.
- **100 choices:** one `Move toward <name>.` option per entity. No shortlist, map, route lengths, scoring answer or preselected destination is sent.

`entities-inline` repeats static capability fields within every record. `entities-shared` replaces those repeated fields with `capability_ref` and a shared `capabilities` dictionary. Names, positions, current HP, faction, status and remaining resources stay on each entity. The actor remains inline. Expanding each reference recreates its complete original entity record; this is checked in tests and when replaying every recorded request.

The complete movement instructions are identical in both formats:

> Which entity should actor move toward to follow commander_prompt and entity_prompt? Commander orders override conflicting individual orders. Match names and metadata in entities; capability_ref refers to shared capabilities when present. HP means current health. equipment_remaining counts unused items. Choose one offered entity. The game finds a legal route to an unoccupied tile adjacent to it. Moving spends 1 AP, then you choose again with updated actor state. Other entities remain still during this navigation evaluation.

Four order types run on every map:

| Order | Example / exact wording | What it checks |
|---|---|---|
| Named ally | `Rendezvous with Hotel-01 as quickly as possible.` | Match a friendly unit’s given name |
| Named hostile | `Approach Brute-12 as quickly as possible. Move only; do not attack.` | Match a bug’s name and approach its occupied footprint |
| Equipment | `Rendezvous with the friendly Radio Squad carrying exactly one radar dish remaining. Move as quickly as possible.` | Read type and current equipment count; exactly one unit matches |
| Commander override | Entity: `Rendezvous with Hotel-01 as quickly as possible.` Commander: `Override individual rendezvous orders: move to the friendly Medic Squad with the lowest current HP. Reach that squad as quickly as possible.` | Follow commander priority and compare HP; the individually named unit is different |

Names vary by map. There are ten Radio Squads and ten Medic Squads in each roster. The equipment target has one radar dish; the other Radio Squads have three. The commander’s target has 1 HP; the other medics have at least 4. These intentionally unambiguous cases test whether the model can find the relevant facts inside the larger state.

## Method and limits

The model is pinned to **`jev-1.13.0`**. Runs were made on 2026-09-22 against game code at `ec2d2be2`; the crowd harness is committed at `2085835b`. The TypeSafe [state](https://docs.typesafe.ai/concepts/state) and [choice](https://docs.typesafe.ai/primitives/choice) documentation informed the structured input and bounded choice question. All calls used the server-side `JevKey` in `.env`.

The pilot uses seed `730982385` at all three shipped sizes. The comparison uses `jev-navigation-holdout-1` (temperate city) and `jev-navigation-holdout-2` (coastal town), again at **48×48, 72×72 and 96×96**. These six maps were separate from the crowd pilot, although they also appeared in the earlier navigation experiment. The two formats and instructions were fixed before this comparison. Reversed-order runs repeat those same cases; they add an option-order check, not independent maps.

Every scene has the real rookie Rifle Squad actor (movement 5, AP 2), **60 squads across all six shipped types**, and **40 bugs across all three species**, including 2×2 brutes. Seeded placement avoids overlaps, keeps free approach space and verifies that every candidate has a reachable adjacent tile. The units physically block routes. The expected target is chosen offline from the farthest eligible units, making the actor traverse substantial distances rather than selecting nearby examples.

**All terrain and all 100 units are explicitly visible.** This isolates roster size, metadata interpretation and subsequent routing. It is not a fog-of-war evaluation. Other units remain stationary, and there is no combat, infestation, hazard damage or enemy phase. The actor never attacks; approaching a hostile is only a navigation task. Mechs and their richer system metadata are not covered.

The game pathfinder routes only after Jev chooses an entity. It targets an unoccupied tile connected by a legal movement step to that entity’s footprint. Each command passes through the real movement handler and must spend exactly one AP. The harness refreshes the actor’s AP after two moves while retaining all other units. All observed metadata and all 100 choices are sent again after each move; no target is cached in place of another inference.

Entity order and choice order are independently shuffled with a fixed seed. The reversal batch reverses only the choice order. There are no inference retries, confidence thresholds, corrections or fallback target selections. Wrong choices are executed. Arrival beside a repeatedly selected wrong entity ends as `wrong-destination`; arrival beside the requested entity succeeds. A case can also stop on an API error, repeated position, or the fixed `2 * optimalAP + 10` AP cap.

Offline shortest-path distances account for all occupied footprints. Uniform infantry movement costs make the minimum AP exact in these fully visible, stationary scenes. The scoring oracle never enters the request. Target-choice accuracy and arrival success are reported separately: repeated correct choices within one trajectory are correlated observations, not independent tasks. HTTP timings include the request and response but exclude local preparation, pathfinding, animation and relay overhead; batches and local checks overlapped, so they are descriptive timings rather than an isolated latency benchmark.

This demonstrates **entity selection followed by deterministic routing**, not Jev independently understanding large maps or solving a tactical mission. The result supports factoring duplicated capabilities before broadening the task to combat, moving targets, fog, richer actors and ambiguous orders. The prototype remains in `tools/jev`; the game controller is unchanged by this evaluation update.

## Reproduce and inspect

Use Node 24 and the repository dependencies. Live commands require `JevKey` in `.env` and make API requests. Choose a fresh output directory each time; existing traces are never overwritten.

```bash
# Build and validate all six maps / 24 orders without calling Jev.
node --experimental-transform-types tools/jev/evaluate-navigation.mjs \
  --suite=holdout --scenario=entities-100 --vision=full \
  --variants=entities-inline,entities-shared --dry-run \
  --out=.producer/jev/crowd-dry-repeat

# The paired 48-trajectory comparison.
node --experimental-transform-types --env-file=.env tools/jev/evaluate-navigation.mjs \
  --suite=holdout --scenario=entities-100 --vision=full \
  --variants=entities-inline,entities-shared --max-requests=1100 \
  --out=.producer/jev/crowd-holdout-repeat

# Reverse all 100 choices for each of the 24 shared-format cases.
node --experimental-transform-types --env-file=.env tools/jev/evaluate-navigation.mjs \
  --suite=holdout --scenario=entities-100 --vision=full \
  --variants=entities-shared --reverse-choices --max-requests=600 \
  --out=.producer/jev/crowd-reversed-repeat

# Harness tests: real occupancy, AP refresh, metadata fidelity and order ground truth.
pnpm exec vitest run tools/jev/navigation-entities.test.mjs tools/jev/navigation-eval.test.mjs

# Replay the committed traces without any API requests.
mkdir -p .producer/jev/crowd-recorded
tar -xzf docs/experiments/jev-navigation/traces.tar.gz -C .producer/jev/crowd-recorded
node --experimental-transform-types tools/jev/verify-navigation.mjs \
  .producer/jev/crowd-recorded/crowd-pilot \
  .producer/jev/crowd-recorded/crowd-holdout \
  .producer/jev/crowd-recorded/crowd-reversed

# Rebuild a report from new 100-entity batches.
node tools/jev/render-navigation-report.mjs \
  .producer/jev/crowd-holdout-repeat .producer/jev/crowd-reversed-repeat \
  --out=.producer/jev/crowd-report-repeat
```

`--suite=pilot` runs the three pilot maps. `--cases=holdout-1-large-equipment` narrows a run to one case. The report’s request inspector reconstructs and hashes each exact payload during generation, then embeds the deduplicated data in the standalone page. The trace archive retains the original individual JSON files.

Previous navigation runs and sample files have been removed from this report and archive as requested. Their historical record remains in Git at `ec2d2be2`.
