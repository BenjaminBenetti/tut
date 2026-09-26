import type { DomainEvent } from "../../core/model/domain-event";
import type { Unsubscribe } from "../../core/model/event-bus";
import type {
  MissionWithdrawnEvent,
  MissionWithdrawnPayload,
} from "../../overworld/model/mission-withdrawn-event";
import { MISSION_WITHDRAWN } from "../../overworld/model/mission-withdrawn-event";
import type { GameState } from "../../save/model/game-state";
import type { CampaignGameStore, StoreObserver } from "./game-session";

// ===========================================
// Types
// ===========================================

/**
 * Told about the offers one command took off the board, in the order
 * the director withdrew them, with the state the command left: the
 * board that holds each replacing pin and the map that names each city.
 */
export type OfferWithdrawalListener = (
  withdrawals: readonly MissionWithdrawnPayload[],
  state: GameState,
) => void;

// ===========================================
// Watcher
// ===========================================

/**
 * A `StoreObserver` that tells the player when an offer leaves the
 * board without being played or ignored (#1179): a story pin that took
 * its city, or a Hive Assault whose hive is gone. Without it the offer
 * simply vanishes. It lives beside the store rather than in the
 * overworld screen because the day can tick elsewhere: the results
 * screen's Continue advances the day before it navigates to the map.
 *
 * ```
 *   change "command", MissionWithdrawn × n ≥ 1  ──► onWithdrawn(payloads, state)
 *   change "command", none                      ──► nothing
 *   change "replace"                            ──► nothing (a load is not news)
 * ```
 *
 * @param onWithdrawn - Told once per command that withdraws anything.
 * @returns An observer to attach to every campaign store.
 */
export function createOfferWithdrawalWatcher(
  onWithdrawn: OfferWithdrawalListener,
): StoreObserver {
  return (store: CampaignGameStore): Unsubscribe =>
    store.subscribe((change) => {
      if (change.kind !== "command") {
        return;
      }
      const withdrawals = change.events
        .filter(isMissionWithdrawn)
        .map((event) => event.payload);
      if (withdrawals.length > 0) {
        onWithdrawn(withdrawals, change.state);
      }
    });
}

// ===========================================
// Helpers
// ===========================================

/** Whether `event` is an offer's withdrawal. */
function isMissionWithdrawn(
  event: DomainEvent,
): event is MissionWithdrawnEvent {
  return event.type === MISSION_WITHDRAWN;
}
