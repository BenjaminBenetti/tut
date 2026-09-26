import type { Unsubscribe } from "../../core/model/event-bus";
import type { GameState } from "../../save/model/game-state";
import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import type { TechConditions } from "../../tech/model/tech-conditions";
import type { TechNode } from "../../tech/model/tech-node";
import { revealedTechNodes } from "../../tech/service/tech-reveal-service";
import type { CampaignGameStore, StoreObserver } from "./game-session";

// ===========================================
// Types
// ===========================================

/** Told about the tech nodes a command brought out of hiding, in tree order. */
export type ResearchRevealListener = (nodes: readonly TechNode[]) => void;

/** What the watcher reads the tree and the conditions from, and whom it tells. */
export interface ResearchRevealWatcherDeps {
  /** The tree whose hidden nodes are watched. */
  readonly catalogue: Pick<TechCatalogue, "listNodes">;
  /**
   * The campaign's conditions: `GameComposition.techConditionsOf`, the
   * function the tree screen and the unlock handler use, so a reveal
   * is exactly a node the screen starts drawing.
   */
  readonly conditionsOf: (state: GameState) => TechConditions;
  /** Told once per command that reveals anything. */
  readonly onRevealed: ResearchRevealListener;
}

// ===========================================
// Watcher
// ===========================================

/**
 * A `StoreObserver` that tells the player when research appears
 * (campaign arc §8: an autopsy is "offered after its first kill"). It
 * remembers the conditions of the state it last saw and, after every
 * command, reports the nodes the new conditions show that the old ones
 * hid: the spitter autopsy after the mission that killed the first
 * spitter. A loaded or replaced campaign is a new baseline, never a
 * reveal, so loading a save announces nothing.
 *
 * ```
 *   attach(store)      ──► baseline := conditionsOf(state)
 *   change "command"   ──► revealed := hidden(baseline) ∩ shown(now) ──► onRevealed
 *                          baseline := conditionsOf(now)
 *   change "replace"   ──► baseline := conditionsOf(now)
 * ```
 *
 * @param deps - The tree, the conditions and the listener.
 * @returns An observer to attach to every campaign store.
 */
export function createResearchRevealWatcher(
  deps: ResearchRevealWatcherDeps,
): StoreObserver {
  return (store: CampaignGameStore): Unsubscribe => {
    let baseline = deps.conditionsOf(store.getState());
    return store.subscribe((change) => {
      const now = deps.conditionsOf(change.state);
      const revealed =
        change.kind === "command"
          ? revealedTechNodes(deps.catalogue.listNodes(), baseline, now)
          : [];
      baseline = now;
      if (revealed.length > 0) {
        deps.onRevealed(revealed);
      }
    });
  };
}
