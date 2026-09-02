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

/** Every event the economy domain can emit. */
export type EconomyEvent = CreditsChangedEvent;

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
