import type { Unsubscribe } from "../../core/model/event-bus";
import type { DeployableId } from "../../overworld/model/deployable";
import type { ScreenAnchor } from "../view/radial-menu-view";

// ===========================================
// InstallationPickSource
// ===========================================

/**
 * What the overworld screen needs from the strategic map to open the
 * installation wheel (#1155, ADR 0007): to hear about an installation
 * being picked with the pointer, and to ask where its model is on
 * screen so the ring can sit on it and follow it as the camera moves.
 * The twin of `CityPickSource`; a screen that opens no installation
 * wheel need not depend on it.
 *
 * ```
 *   map click ──► onInstallationPicked(id) ──► screen opens the wheel
 *   each frame ──► installationScreenPosition(id) ──► wheel.moveTo
 * ```
 */
export interface InstallationPickSource {
  /** Subscribes to pointer picks on installation models; returns the matching unsubscribe. */
  onInstallationPicked(listener: (id: DeployableId) => void): Unsubscribe;

  /** Client-pixel position of an installation's model, or undefined when it is not drawn. */
  installationScreenPosition(id: DeployableId): ScreenAnchor | undefined;
}
