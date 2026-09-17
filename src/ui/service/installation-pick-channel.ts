import type { Unsubscribe } from "../../core/model/event-bus";
import type { DeployableId } from "../../overworld/model/deployable";
import type { InstallationPickSource } from "../model/installation-pick-source";
import type { ScreenAnchor } from "../view/radial-menu-view";
import type { PickProjector } from "./pick-channel";
import { PickChannel } from "./pick-channel";

// ===========================================
// Types
// ===========================================

/** Projects an installation's model to client pixels; undefined when it is not drawn. */
export type InstallationProjector = PickProjector<DeployableId>;

// ===========================================
// InstallationPickChannel
// ===========================================

/**
 * The `InstallationPickSource` the app wires between the map's picking
 * controller and the overworld screen (#1155): a `PickChannel` over
 * deployable ids under the source's names.
 */
export class InstallationPickChannel implements InstallationPickSource {
  // ===========================================
  // Fields
  // ===========================================

  private readonly channel = new PickChannel<DeployableId>();

  // ===========================================
  // InstallationPickSource
  // ===========================================

  /** Subscribes to picks; returns the matching unsubscribe. */
  onInstallationPicked(listener: (id: DeployableId) => void): Unsubscribe {
    return this.channel.onPicked(listener);
  }

  /** Where the installation is, through the attached projector; undefined before one is attached. */
  installationScreenPosition(id: DeployableId): ScreenAnchor | undefined {
    return this.channel.screenPositionOf(id);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Attaches (or replaces) the map's projection; `undefined` detaches it. */
  useProjector(projector: InstallationProjector | undefined): void {
    this.channel.useProjector(projector);
  }

  /** Reports a pointer pick to every listener. */
  emit(id: DeployableId): void {
    this.channel.emit(id);
  }
}
