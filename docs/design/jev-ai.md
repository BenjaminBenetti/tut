# Jev AI approach

**Jev chooses what to do; the game handles rules, pathfinding and execution.** The movement approach below is validated in evaluations and awaits gameplay integration.

## State sent to Jev

- **Actor:** name, type, faction, position, HP, remaining AP, capabilities and resources.
- **Entities:** known units, their names, types, positions, relationships, HP and known resources.
- **Shared capabilities:** common weapon, equipment and ability definitions stored once and referenced by entities.
- **Objectives:** relevant known goals and locations.
- **`entity_prompt`:** this actor's orders.
- **`commander_prompt`:** faction orders, which take priority when orders conflict.

Use shared faction knowledge throughout. Hidden information stays hidden. Each question includes clear gameplay instructions and only its relevant choices.

## Full decision loop

1. **Check eligibility.** If the actor cannot act, has no AP or has no legal actions, stop without calling Jev.
2. **Build fresh state and legal choices.** List the actor's available actions, including each specific weapon and usable item separately.
3. **Ask Jev to choose an action.** For example: move, fire its rifle, throw its grenade or overwatch.
4. **Ask for the selected action's details, if needed.** For movement, choose an entity or objective to approach. For a weapon or item, choose from that action's legal targets. Actions needing no further choice proceed directly.
5. **Validate and execute in the game.** Movement follows a game-calculated route for one AP, respecting known terrain and occupied tiles. Other actions spend their defined AP cost. Choosing an action or target alone spends nothing.
6. **Return to step 1.** Refresh the state and ask for a new action while the actor can still act. It can move again or choose something else.

For movement, Jev chooses the destination; tile maps and exhaustive tile choices stay out of that question. The game routes toward a legal nearby tile when approaching a unit. Reaching an objective and completing it are separate actions.

## Validation and inspection

The [movement evaluations](../experiments/jev-navigation/README.md) tested real maps with 100 entity destinations. Sharing capability definitions improved reliability and reduced input size. These tests used fully visible, stationary units; combat, moving targets and crowded scenes under fog still need validation.

The [development inspector](jev-control.md) should let us step through the state, both question stages, responses and resulting action, including failures.
