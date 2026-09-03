import type { TacticalState } from "../../tactical/model/tactical-state";
import type { TacticalIntentSink } from "./tactical-intent";

// ===========================================
// TacticalSceneHost
// ===========================================

/**
 * Lets the tactical screen borrow a three.js scene for the mission it
 * shows without importing three itself (architecture §3). The app
 * builds the scene, camera, models and input controller; the screen
 * owns the DOM around the viewport and the store subscription.
 *
 * ```
 *   screen.mount ──► host.attach(viewport, mission, intents)   builds scene + input
 *   store change ──► host.update(mission)                       moves units
 *   screen.unmount ► host.release()                             disposes everything
 * ```
 */
export interface TacticalSceneHost {
  /**
   * Builds the scene for `mission` inside `container`, routing the
   * player's intents to `intents`. Resolves once the units are placed.
   */
  attach(
    container: HTMLElement,
    mission: TacticalState,
    intents: TacticalIntentSink,
  ): Promise<void>;

  /** Brings the units in step with a newer mission state. Resolves when placed. */
  update(mission: TacticalState): Promise<void>;

  /** Tears the scene down. Safe to call when not attached. */
  release(): void;
}
