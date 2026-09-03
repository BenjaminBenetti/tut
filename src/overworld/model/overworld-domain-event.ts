import type { EconomyEvent } from "../../economy/model/economy-event";
import type { RosterEvent } from "../../roster/model/roster-event";
import type { CampaignApplied, CampaignEvent } from "./campaign-event";

// ===========================================
// Event map
// ===========================================
//
// "Event" is overloaded in this domain: `EventType` (event-type.ts) is a
// GDD §5.4 happening the player answers with a choice. The types here are
// ADR 0003 domain events: plain facts about what a tick or a command
// changed, emitted for presentation to animate.
//
// The union is *derived* from `OverworldEventMap`, and each event module
// registers itself into the map from its own file, so adding an event
// never edits a shared line (#246):
//
// ```
//   day-advanced-event.ts          deployable-status-event.ts
//   ┌────────────────────────┐     ┌────────────────────────────┐
//   │ export const DAY_ADVANCED    │ export const DEPLOYABLE_OFFLINE
//   │ export type DayAdvancedEvent │ export type DeployableOfflineEvent
//   │ declare module "./overworld-domain-event" {
//   │   interface OverworldEventMap { [DAY_ADVANCED]: DayAdvancedEvent } }
//   └───────────┬────────────┘     └──────────────┬─────────────┘
//               └───────────── augment ───────────┘
//                                  ▼
//               OverworldEventMap ──► CampaignEvent (campaign-event.ts) = values of the map
// ```
//
// To add an event: create `overworld/model/<name>-event.ts` with the
// constant, payload, event type and the `declare module` block above.
// Nothing here changes. Whole-domain event groups from other slices
// (economy, roster) register as one entry each, here, because those
// domains must not import `overworld/`.

/**
 * Registry of every event the campaign can emit, keyed by its `type`
 * tag. Empty here by design: event modules augment it. Must stay an
 * `interface` (augmentation cannot extend a type alias).
 */
export interface OverworldEventMap {
  /** Every economy event, as one group (GDD §5.5). */
  readonly economy: EconomyEvent;
  /** Every roster event, as one group (GDD §5.7): roster commands (#63) run through this dispatcher. */
  readonly roster: RosterEvent;
}

// ===========================================
// Derived unions
// ===========================================

/**
 * The union derived from the map lives in `campaign-event.ts` as
 * `CampaignEvent`; it is re-exported here so either import path works.
 */
export type { CampaignEvent } from "./campaign-event";

/**
 * Former name of `CampaignEvent`, kept as an alias for one release so
 * existing imports compile. New code imports `CampaignEvent`.
 */
export type OverworldDomainEvent = CampaignEvent;

/**
 * Former name of `CampaignApplied`, kept as an alias for one release:
 * the `{ state, events }` pair overworld handlers and tick steps return.
 */
export type OverworldApplied<TState> = CampaignApplied<TState>;

// ===========================================
// Re-exports
// ===========================================
//
// The events that lived in this file before #246 are re-exported so
// existing imports keep compiling for one release. Events added after
// #246 live only in their own module; import them from there.

export * from "./city-infestation-changed-event";
export * from "./day-advanced-event";
export * from "./deployable-status-event";
export * from "./game-ended-event";
export * from "./infestation-seeded-event";
export * from "./infestation-spread-event";
export * from "./mission-expired-event";
export * from "./mission-offered-event";
export * from "./threat-changed-event";
