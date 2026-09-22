# Jev AI approach

This document records the direction for Jev-driven tactical decisions as we validate each part. Movement is the first established approach: **Jev interprets orders and chooses a destination; the game handles pathfinding and execution.** This approach has been validated in evaluations and is awaiting integration into gameplay.

## Movement planning

Once movement has been selected as the action, ask Jev which known entity or objective to move toward. Meaningful destinations keep the decision connected to the orders: follow a named squad, approach an enemy, reach an objective, or find a unit with a needed capability.

The game owns the route, terrain rules, occupied tiles and movement costs. Approaching a unit means reaching a legal nearby position. Reaching an objective is separate from performing whatever action completes it.

The movement loop is:

1. Build the actor's current view using shared faction knowledge and its individual and commander orders. Commander orders take priority when they conflict.
2. Give Jev the available destinations and enough context to choose between them.
3. Calculate and validate a route to the chosen destination, then execute one action point of movement.
4. Refresh the state and return to action selection while AP remains. Each move is a new opportunity to respond to the situation.

An actor with no AP does not need a Jev decision. Both the information sent to Jev and the route planner must respect faction knowledge and fog of war.

## Keep the decision clear

The movement request describes the actor, potential destinations and their relevant metadata. Unit names and unit types are separate, so orders such as “follow Alpha” can identify the right squad. Current health, relationships, capabilities and remaining resources support orders based on the situation.

Describe shared capabilities once and reference them from individual entities. Keep each entity's identity and current condition with that entity. This removes repeated information while preserving the facts needed to make the choice.

Tile maps and exhaustive tile-by-tile movement choices stay out of this destination-selection question. The game already has the geometry and rules needed to calculate the route. Include additional context when an evaluated decision needs it.

Instructions must explain the decision and its gameplay consequences. Jev should understand that the game routes toward its chosen destination, the move spends one AP, and it will receive a fresh state afterward. We cannot assume it already knows the game's rules.

## Evidence and observability

Evaluations on real game maps supported this division of work, including a scene roster with 100 possible entity destinations. Sharing capability definitions reduced input size and improved reliability over repeating those definitions in every entity record. The tests covered named orders, capability-based orders and commander priority.

That establishes a useful movement foundation. The crowded-map tests used fully visible, stationary entities; moving targets, combat positioning and crowded scenes under fog still need validation. Detailed results and recorded decisions live in the [navigation evaluations](../experiments/jev-navigation/README.md).

Keep the complete decision visible during development: the state, instructions, offered choices, Jev's response and the movement that followed. Step through decisions and retain failures so we can distinguish choosing the wrong destination from failing to reach the right one. Evaluate outcomes as well as confidence.

As further AI behaviors are validated, extend this document with their approach and evidence. Runtime setup and inspector usage belong in [Jev control](jev-control.md).
