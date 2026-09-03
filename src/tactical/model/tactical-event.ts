import type { Applied } from "../../core/model/domain-event";

// ===========================================
// Tactical event map
// ===========================================
//
// The union of tactical events is *derived* from `TacticalEventMap`, and
// each event module registers itself from its own file (#246). The whole
// group joins the campaign's `OverworldEventMap` as one `tactical` entry
// (declared there with a type import, the way the roster and economy
// groups are), so every tactical event reaches the one store and the one
// autosave (Tech Lead ruling on #324).
//
// To add an event: create `tactical/model/<name>-event.ts` with the
// `tactical:` tag, payload, event type and
//
// ```
//   declare module "./tactical-event" {
//     interface TacticalEventMap { [TAG]: XEvent }
//   }
// ```

/**
 * Registry of every tactical event, keyed by its `type` tag. Empty here
 * by design: event modules augment it. Must stay an `interface`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmented by each event module
export interface TacticalEventMap {}

// ===========================================
// Derived unions
// ===========================================

/** Every event the tactical rules can emit. Derived from the map. */
export type TacticalEvent = TacticalEventMap[keyof TacticalEventMap];

/** The `{ state, events }` pair tactical services return. */
export type TacticalApplied<TState> = Applied<TState, TacticalEvent>;
