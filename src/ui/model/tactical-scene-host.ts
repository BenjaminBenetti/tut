import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Vec2 } from "../../core/model/grid";
import type { UnitId } from "../../tactical/model/unit";
import type { WeaponId } from "../../tactical/model/unit-weapon";
import type {
  TacticalIntentSink,
  TacticalInvokeTarget,
} from "./tactical-intent";

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
 *   store change ──► host.update(mission, events)               animates, then moves units
 *   selection    ──► host.select(unitId)                        range / cover / LOS overlays
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

  /**
   * Plays `events` in order, then brings the units in step with the
   * newer mission state. Resolves when the units are placed.
   */
  update(
    mission: TacticalState,
    events?: readonly TacticalEvent[],
  ): Promise<void>;

  /**
   * Shows the overlays for a selected unit, or clears them.
   *
   * @param unitId - The selected unit.
   * @param targetId - The armed target, when one is chosen. It narrows
   *   the sight cue to that target rather than to any enemy (#517),
   *   which is what a player facing a refusal needs to see.
   * @param weaponId - The armed weapon, when the unit carries more than
   *   one (#532); the range boundary is drawn for that weapon's reach,
   *   so it agrees with the hit preview.
   */
  select(
    unitId: UnitId | undefined,
    targetId?: string,
    weaponId?: WeaponId,
  ): void;

  /**
   * Shows or hides the weapon-range outline (#522). The screen owns the
   * toggle so the state survives a re-selection; the scene only draws.
   */
  setWeaponRangeVisible(visible: boolean): void;

  /**
   * Where a world thing appears on screen, in client pixels, or
   * undefined when it is not drawn.
   *
   * The host owns the camera, so it is the only thing that can answer
   * this. In-world UI anchors to a **world reference** rather than to
   * the pixel a click happened at (ADR 0007 §2.2), which is what lets a
   * menu follow its target and dismiss itself when the target goes.
   *
   * @param target - The unit, spawner or tile the menu belongs to.
   * @returns Client pixels, or undefined when nothing is drawn there.
   */
  screenPositionOf(target: TacticalInvokeTarget): Vec2 | undefined;

  /** Tears the scene down. Safe to call when not attached. */
  release(): void;
}
