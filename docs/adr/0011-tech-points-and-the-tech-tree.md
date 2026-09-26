# ADR 0011: Tech points and the tech tree

Status: Accepted — Executive Director feature request, 2026-09-19, #1171.

## Context

Every mech part was purchasable for credits from day one, so the roster's tier 2 and tier 3 parts (#1168) were a price list rather than a progression. The Executive Director asked for a second resource, tech points, earned from missions and from harvestable bug carcasses on the map, spent on a tech tree that unlocks parts, paced so that a campaign of about 25 tactical missions works through the whole tree.

## Decision

**Tech points live on the economy slice.** `EconomyState` gains `techPoints`; a `TechPointService` (`TechPointTreasury`) is the one door they move through, emitting `TechPointsChanged`. They keep no ledger: nothing prices them, nothing reconciles them, and the two flows (mission rewards in, unlocks out) are already events.

**The tree is its own simulation domain, `tech/`.** It owns `TechNode { id, family, tier, cost, requires, unlocks: PartId[] }`, the `TechCatalogue` interface, `TechState { unlocked }` (a new root slice, schema 26) and two services: `unlockTech` (a pure `Result` service over the tech and economy slices, driven by the overworld command `UnlockTech`) and `createPartAvailability`, which turns the unlocked set into the roster's `PartAvailability` interface. `roster/` depends only on that interface; it never imports `tech/`. Tier 1 is always available; a part above tier 1 is available exactly when a node naming it is unlocked. `buildMech` refuses a locked part with a `part-locked` loadout error, and the mech bay palette refuses to drag or fit a locked part at all (Executive Director, 2026-09-19); the error still matters for a template or an older save that carries the part into the draft, and saving a template is not gated.

**Rewards are frozen at generation.** A mission type declares `techRewardBase` and `techRewardPerDifficulty`; `MissionRewards.techPoints` is computed when the offer is generated and paid by the launch handler on the same scale as credits (`techPointsFor`: full on a win, a fraction on extraction, nothing on a loss). Whether a map carries a tech carcass is also decided at generation, on an RNG fork keyed by the mission id so the roll perturbs nothing else, and stored as `MissionMapParams.techCarcass`; the tactical layer turns it into a `tech-carcass` hook, a `TechCarcass` in the mission state and a `HarvestCarcass` command for infantry squads. Harvested points come home on any outcome but a loss, reported separately as `MissionResult.techPointsHarvested`.

**Pacing is a data test, not a promise.** The tree costs 728 points. The test in `tech/data/tech-tree.test.ts` models 25 clearance missions ramping from difficulty 2 to 8 with the tuned carcass rate and holds the tree's cost within ten percent of that income, so retuning either side without the other fails the build.

**The tree is drawn as a graph in three, through a host interface.** The tech tree screen depends on `TechGraphHost` (`ui/model/`), the way the mech bay depends on `MechPreviewHost`: the screen lays the graph out (`ui/service/tech-graph-layout.ts`, a pure radial layout over the catalogue), floats a label per node and per family, and owns the detail panel where Unlock lives; `DomTechGraphHost` (`app/service/`) composes `TechGraphSceneBuilder` (`graphics/service/`), the shared `OrthographicCameraRig`, `CameraInputController` and `PickingController`, and `SceneService`, so the web pans, zooms and rotates exactly as the tactical map does. The builder draws each node's first part with a model from the §7 part table on a pedestal and a generic module for a part without one; it never touches the DOM, and the labels never take pointer events, so a wheel over a label still reaches the camera.

**Free points are a command a production build refuses.** `GrantTechPoints` is registered everywhere; its handler earns through the treasury only when the composition was told it is a dev build, and refuses with `dev-tools-disabled` otherwise, the same shape as the tactical `PlaceUnit` tool. The composition exposes `techDevTools` in a dev build only, and the tree builds its Free TP button only when given them.

## Consequences

Older saves migrate with no points and nothing unlocked, and every offer in them is priced by its type's current tech reward. A shipped part above tier 1 that no node unlocks is a content bug the data test catches. Screens read `content.tech` for the tree and `techNodeStatus` for a card's state, and the same checks in the same order decide what `unlockTech` accepts, so a card shown as available is one the command will take. The tech domain is the tenth simulation domain in `SIMULATION_DOMAINS`; its imports point at `core/`, `economy/` and `roster/` models only.

## Amended by ADR 0013

ADR 0013 §2.7 (campaign progression, #1179) extends the tree beyond mech parts. `TechState` stays `{ unlocked }`, and the save schema does not change.

- **Kinds and effects.** `TechNode` gains `kind` (`part`, `intel`, `autopsy`, `infantry` or `story`) and swaps `unlocks: PartId[]` for `effects: readonly TechEffect[]`. A `TechEffect` is one of four shapes: a part, a flag, a squad type or an infantry upgrade. `partIdsOf(node)` reads back what `unlocks` used to hold, and part availability, the mech bay and the scene builder all use it. Every shipped node is a part node with one part effect per part.
- **Cost and tier.** A part node is still priced by its tier. Any other kind of node carries its own cost, and its tier only chooses the ring it is drawn on. The pacing test and the tier-3 prerequisite rules apply to part nodes only.
- **Hidden nodes.** `requiresFlags` keeps a node hidden until every flag is present. `tech/` does not read the campaign itself. The caller passes `TechConditions { flags }`, and the overworld handler gets them from an injected `conditionsOf(state)`. Every prerequisite's flags must also appear in the node's own `requiresFlags`, so a shown node never hangs off a hidden one. The data test enforces this.
- **Order of checks.** `unlockTech` and `techNodeStatus` run the same checks in the same order: hidden, known, unlocked, prerequisites, affordable. A known hidden node is refused with `tech-hidden`, and its status is `hidden`. A test sweeps both functions to prove they agree.
- **After an unlock.** The handler takes an optional `onUnlocked(state, node)`. The campaign uses it to apply a node's non-part effects. Its events come after `TechUnlocked`.
- **The graph.** `layoutTechGraph` takes the conditions and drops hidden nodes, their links and any family with nothing to show. Sectors are 2π / n for any number of families, and the rings grow when a crowded family would not fit. With the six shipped families the rings stay 6, 24 and 30. The tree screen lays the graph out again whenever the set of hidden nodes changes. The detail panel lists each effect in words.

Before and after renders of the screen with the shipped data: `docs/design/tech-conditions-before.png`, `docs/design/tech-conditions-after.png`.
