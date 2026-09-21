# Jev 4×4 follow-up: explain movement AP costs

Run: 2026-09-21T05:53:19.730Z to 2026-09-21T05:53:21.827Z. Model: `jev-1.13.0`. All 20 calls succeeded.

Explicit movement instructions selected A3, the most AP-efficient destination, in **10/10 trials for each format**. The original samples selected A3 in 0/10 game-format trials and 1/10 ASCII trials. This supports the hypothesis that the earlier prompt did not adequately explain the cost of a short move. It does not establish navigation reliability on other maps.

Both formats now use the same entity prompt:

```json
{"entity_prompt": "Reach objective-1."}
```

Both receive this exact Choice instruction:

> Choose the destination for one movement action to carry out entity_prompt. AP means action points; the actor has 2 AP remaining. Every offered destination costs exactly 1 AP, whether the route travels one tile or two tiles. One AP allows movement along a walkable path of up to two tiles. Movement is horizontal or vertical, may turn, and cannot cross blocked tiles. Unused movement range is lost when this action ends: moving only one tile does not save any AP. After this move, another decision can spend the remaining AP on another action. Choose the destination that reaches the objective in the fewest total movement actions, accounting for blocked tiles and any backtracking needed. Select only an offered destination.

The instructions explain one-AP costs, two-tile range, orthogonal movement, unused range, subsequent actions and the goal of minimizing movement actions. They never name the expected choice, reveal its distance to the objective, or give the path.

| Metric | Game-format sample | ASCII sample |
| --- | ---: | ---: |
| Best move A3, original instructions | 0/10 | 1/10 |
| Best move A3, explicit AP instructions | **10/10** | **10/10** |
| Mean reported confidence, updated run | 41.5% | 37.4% |
| Mean probability assigned to A3 | 61.2% | 58.2% |
| Input tokens per request | 1428 | 622 |
| Mean HTTP round trip | 106.9 ms | 101.5 ms |

| Trial | Game choice | Reported confidence | ASCII choice | Reported confidence |
| ---: | --- | ---: | --- | ---: |
| 1 | A3 (`action-2`) | 40% | A3 | 43% |
| 2 | A3 (`action-2`) | 42% | A3 | 37% |
| 3 | A3 (`action-2`) | 37% | A3 | 30% |
| 4 | A3 (`action-2`) | 42% | A3 | 32% |
| 5 | A3 (`action-2`) | 41% | A3 | 35% |
| 6 | A3 (`action-2`) | 51% | A3 | 47% |
| 7 | A3 (`action-2`) | 42% | A3 | 30% |
| 8 | A3 (`action-2`) | 39% | A3 | 49% |
| 9 | A3 (`action-2`) | 41% | A3 | 30% |
| 10 | A3 (`action-2`) | 40% | A3 | 41% |

The map, three destinations, destination order, model version and ten-repetition protocol match the [original experiment](jev-4x4-format-comparison.md). The game-format request changes only its instructions. ASCII additionally gains the matching entity prompt and names its O marker as objective-1; its options and map rows remain unchanged. Thus the game-format improvement directly tests the instruction change, while the ASCII improvement also includes normalization of its goal instruction.

All repetitions reuse the same map. The comparison still uses the simplified movement-only samples rather than full production state. No prompt tuning or retries occurred within this run. Confidence is the API confidence field, not measured correctness; timings include network latency and exclude the browser/relay.

In this test the game’s existing representation worked with explicit movement rules. ASCII remains smaller, but representation changes are not necessary to obtain the correct move here. A next evaluation should retain this prompt and vary obstacle layouts and actor positions before drawing broader conclusions.

This experiment updates the benchmark runner and records results; it does not change the production gameplay prompt. The two-tile allowance and two remaining AP in this test must come from the actor’s actual state in a production instruction.

Exact inputs and responses: [results JSON](jev-4x4-ap-results.json). The original result file remains unchanged.

Reproduce the 20 live calls:

```sh
node --env-file=.env tools/jev/compare-map-formats.mjs .producer/jev/map-format-ap-rerun.json --explain-ap
```

Validate and inspect inputs without making API calls:

```sh
node tools/jev/compare-map-formats.mjs --explain-ap --dry-run
```
