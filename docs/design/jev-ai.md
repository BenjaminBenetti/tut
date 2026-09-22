# Jev AI approach

**Jev chooses what to do; the game handles rules, pathfinding and execution.** The game uses this loop for opt-in Jev control and development inspection.

## State sent to Jev

- **Actor:** name, type, faction, position, HP, remaining AP, capabilities and resources.
- **Entities:** known units, their names, types, positions, relationships, HP and known resources.
- **Shared capabilities:** common weapon, equipment and ability definitions stored once and referenced by entities.
- **Objectives and extraction:** relevant known goals, locations and the extraction zone.
- **`entity_prompt`:** this actor's orders.
- **`commander_prompt`:** faction orders, which take priority when orders conflict.

Entity information uses shared faction vision. The game's path planner knows the full map layout, including floors and stairs through fog. Each question includes clear gameplay instructions and only its relevant choices.

## Full decision loop

1. **Check eligibility.** If the actor cannot act, has no AP or has no legal actions, stop without calling Jev.
2. **Build fresh state and legal choices.** List the actor's available actions, including each specific weapon and usable item separately.
3. **Ask Jev to choose an action.** For example: move, fire its rifle, throw its grenade or overwatch.
4. **Ask for the selected action's details, if needed.** For movement, choose an entity, objective, extraction zone, direction or retreat. Weapons and immediate explosives target visible hostile entities, including nests, even for area attacks. Other items retain their legal placement targets. Actions needing no further choice proceed directly.
5. **For movement only, ask Jev how far to move.** Prepare a proposed one-AP move, then send the full state plus the selected movement, proposed endpoint and available distance. Ask Jev to score how much of that move the actor should use.
6. **Validate and execute in the game.** Scale movement by the distance score and round up to the next legal stopping point, capped at the available one-AP move and still fitting the selected movement intent. An executed move costs one AP; other actions spend their defined AP cost. Overwatch costs one AP and ends the actor's activation; actions marked as ending activation forfeit any remaining AP. Questions alone spend nothing.
7. **Return to step 1.** Refresh the state and ask for a new action while the actor can still act. It can move again or choose something else.

## Movement options

After choosing movement, Jev selects one of these options. The game prepares the full available move within one AP; the distance follow-up can shorten it before execution.

| Option | Meaning |
|---|---|
| Entity target | One choice per known entity, identified by name and type. Move toward a free tile beside it. |
| Objective target | One choice per known objective. Move toward its location; arrival alone does not complete it. |
| `move_to_extraction` | Move into the nearest reachable extraction tile. TDF must then choose Extract to leave; bugs can approach the zone but cannot extract. |
| `move_north`, `move_east`, `move_south`, `move_west` | Move as far as possible in that map direction within one AP. |
| `move_away_from_enemies` | Choose the reachable tile within one AP that maximizes distance from the nearest known hostile. |

Offer options only when they produce a legal move. Routes use the full map layout and known occupied tiles; approaching an entity on another floor requires reaching that floor. Retreat requires a known hostile and a destination that increases separation. Directions follow the map's compass. Tile maps and exhaustive tile choices stay out of the Jev question.

The distance question is **“How much of the available movement should the actor use to follow its orders?”** It receives all actor and entity metadata alongside the selected movement. A normalized score of 1 means the full move; 0.5 means roughly half. Instructions must make clear that a shorter move still spends the whole AP.

## Adding capabilities

Jev reads weapons and usables from each entity’s actual loadout, for both factions, using the game’s normal legality checks and previews. New content using existing mechanics needs no Jev-specific wiring. New action or item kinds must supply targeting, execution and gameplay instructions; typechecking prevents silent omissions.

## Validation and inspection

The [movement evaluations](../experiments/jev-navigation/README.md) tested real maps with 100 entity destinations. Sharing capability definitions improved reliability and reduced input size. These tests used fully visible, stationary units. Directional movement, retreat and distance scoring are implemented. Their rules have deterministic tests; distance scoring still needs live comparison with full-length moves to check for wasted AP. Combat, moving targets and crowded scenes under fog also need validation.

An initial distance-scoring pass reached the correct target but used **17 AP versus the recorded 14-AP baseline**. On the same 100-entity scene, normalized scores shortened 16 moves even though full movement was the most likely response at every step. That pass rounded to the nearest step; the game now rounds up instead. Distance scoring remains experimental.

The [development inspector](jev-control.md) lets us step through the state, each question stage, responses and resulting action, including failures.
