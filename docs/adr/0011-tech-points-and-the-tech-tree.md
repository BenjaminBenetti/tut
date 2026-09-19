# ADR 0011: Tech points and the tech tree

Status: Accepted — Executive Director feature request, 2026-09-19, #1171.

## Context

Every mech part was purchasable for credits from day one, so the roster's tier 2 and tier 3 parts (#1168) were a price list rather than a progression. The Executive Director asked for a second resource, tech points, earned from missions and from harvestable bug carcasses on the map, spent on a tech tree that unlocks parts, paced so that a campaign of about 25 tactical missions works through the whole tree.

## Decision

**Tech points live on the economy slice.** `EconomyState` gains `techPoints`; a `TechPointService` (`TechPointTreasury`) is the one door they move through, emitting `TechPointsChanged`. They keep no ledger: nothing prices them, nothing reconciles them, and the two flows (mission rewards in, unlocks out) are already events.

**The tree is its own simulation domain, `tech/`.** It owns `TechNode { id, family, tier, cost, requires, unlocks: PartId[] }`, the `TechCatalogue` interface, `TechState { unlocked }` (a new root slice, schema 26) and two services: `unlockTech` (a pure `Result` service over the tech and economy slices, driven by the overworld command `UnlockTech`) and `createPartAvailability`, which turns the unlocked set into the roster's `PartAvailability` interface. `roster/` depends only on that interface; it never imports `tech/`. Tier 1 is always available; a part above tier 1 is available exactly when a node naming it is unlocked. `buildMech` refuses a locked part with a `part-locked` loadout error; saving a template is not gated, so a player can plan a build before earning it.

**Rewards are frozen at generation.** A mission type declares `techRewardBase` and `techRewardPerDifficulty`; `MissionRewards.techPoints` is computed when the offer is generated and paid by the launch handler on the same scale as credits (`techPointsFor`: full on a win, a fraction on extraction, nothing on a loss). Whether a map carries a tech carcass is also decided at generation, on an RNG fork keyed by the mission id so the roll perturbs nothing else, and stored as `MissionMapParams.techCarcass`; the tactical layer turns it into a `tech-carcass` hook, a `TechCarcass` in the mission state and a `HarvestCarcass` command for infantry squads. Harvested points come home on any outcome but a loss, reported separately as `MissionResult.techPointsHarvested`.

**Pacing is a data test, not a promise.** The tree costs 728 points. The test in `tech/data/tech-tree.test.ts` models 25 clearance missions ramping from difficulty 2 to 8 with the tuned carcass rate and holds the tree's cost within ten percent of that income, so retuning either side without the other fails the build.

## Consequences

Older saves migrate with no points and nothing unlocked, and every offer in them is priced by its type's current tech reward. A shipped part above tier 1 that no node unlocks is a content bug the data test catches. Screens read `content.tech` for the tree and `techNodeStatus` for a card's state, and the same checks in the same order decide what `unlockTech` accepts, so a card shown as available is one the command will take. The tech domain is the tenth simulation domain in `SIMULATION_DOMAINS`; its imports point at `core/`, `economy/` and `roster/` models only.
