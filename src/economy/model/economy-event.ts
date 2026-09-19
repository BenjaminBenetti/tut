import type { Applied, DomainEvent } from "../../core/model/domain-event";
import type { EconomyState } from "./economy-state";
import type { Transaction } from "./transaction";

// ===========================================
// Event types
// ===========================================

/** Event type emitted whenever credits move. Namespaced for the event bus. */
export const CREDITS_CHANGED = "economy:credits-changed";

/** What presentation needs to animate a balance change. */
export interface CreditsChangedPayload {
  /** Balance before the transaction. */
  readonly before: number;
  /** Balance after the transaction. */
  readonly after: number;
  /** The ledger entry that was appended. */
  readonly transaction: Transaction;
}

/** Credits entered or left the treasury. */
export type CreditsChangedEvent = DomainEvent<
  typeof CREDITS_CHANGED,
  CreditsChangedPayload
>;

/** Event type emitted whenever tech points move (#1171). */
export const TECH_POINTS_CHANGED = "economy:tech-points-changed";

/** What presentation needs to animate a tech point change. */
export interface TechPointsChangedPayload {
  /** Pool before the movement. */
  readonly before: number;
  /** Pool after the movement. */
  readonly after: number;
  /** Signed movement: positive when earned, negative when spent. */
  readonly amount: number;
  /** What the movement was for: a mission id or a tech node id. */
  readonly ref: string;
  /** Overworld day it happened on. */
  readonly day: number;
}

/** Tech points were earned or spent. */
export type TechPointsChangedEvent = DomainEvent<
  typeof TECH_POINTS_CHANGED,
  TechPointsChangedPayload
>;

/** Every event the economy domain can emit. */
export type EconomyEvent = CreditsChangedEvent | TechPointsChangedEvent;

// ===========================================
// Applied shape
// ===========================================

/**
 * The `{ state, events }` pair economy services return.
 *
 * ```
 *   (EconomyState, command) ──► service ──► { state: EconomyState', events: EconomyEvent[] }
 * ```
 */
export type EconomyApplied = Applied<EconomyState, EconomyEvent>;
