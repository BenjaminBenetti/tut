import type {
  Deployable,
  DeployableId,
} from "../../overworld/model/deployable";
import type {
  DeployableType,
  DeployableTypeId,
} from "../../overworld/model/deployable-type";
import { isDeployableTypeId } from "../../overworld/model/deployable-type";
import type { DeployableTypeCatalogue } from "../../overworld/model/deployable-type-catalogue";
import type { RegionId } from "../../overworld/model/region";
import type { GameState } from "../../save/model/game-state";
import { formatCredits } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the deployables section reports back to its owner. */
export interface DeployablesViewHandlers {
  /** The player pressed Build for a type in the shown region. */
  readonly onBuild: (typeId: DeployableTypeId, regionId: RegionId) => void;
  /** The player pressed Decommission on an installation. */
  readonly onDecommission: (deployableId: DeployableId) => void;
}

// ===========================================
// DeployablesView
// ===========================================

/**
 * The selected region's installations (GDD §5.6): what is built, with
 * its status and upkeep and a Decommission button, then one Build button
 * per type showing cost, upkeep and how many of the cap are used. Build
 * is disabled when the treasury cannot cover the cost or the region is
 * at the type's cap; the reason is in the button's title.
 *
 * ```
 *   DEPLOYABLES · North America East
 *   ├ Defensive battery   online   ¢50/day   [Decommission]
 *   ├ Sensor array        offline  ¢20/day   [Decommission]
 *   [Build Defensive battery ¢1,500 · 1/2]  [Build Repellent … ¢1,000 · 0/1]  …
 * ```
 *
 * The lists are rebuilt on every update (they are a handful of rows);
 * one delegated click listener on the section serves every button; a
 * Decommission button finds its installation from the row it sits in.
 */
export class DeployablesView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: DeployablesViewHandlers;
  private readonly catalogue: DeployableTypeCatalogue;
  private root: HTMLElement | undefined;
  private region: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private builds: HTMLElement | undefined;
  private empty: HTMLElement | undefined;
  private regionId: RegionId | undefined;
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Callbacks for the buttons; `catalogue` supplies names, costs and caps. */
  constructor(
    handlers: DeployablesViewHandlers,
    catalogue: DeployableTypeCatalogue,
  ) {
    this.handlers = handlers;
    this.catalogue = catalogue;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the section under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.id = "deployables";
    section.className = "tut-deployables";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Deployables";
    const region = doc.createElement("div");
    region.className = "tut-dim";
    region.dataset.field = "deployables-region";
    region.textContent = "—";

    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-region";
    empty.textContent = "Select a city to manage its region.";

    const list = doc.createElement("ul");
    list.className = "tut-list";
    list.dataset.role = "deployable-list";
    list.hidden = true;

    const builds = doc.createElement("div");
    builds.className = "tut-stack tut-deployables__build";
    builds.dataset.role = "build-options";
    builds.hidden = true;

    section.append(title, region, empty, list, builds);
    parent.appendChild(section);

    const onClick = (event: Event): void => {
      this.handleClick(event);
    };
    section.addEventListener("click", onClick);
    this.dispose = () => {
      section.removeEventListener("click", onClick);
    };

    this.root = section;
    this.region = region;
    this.list = list;
    this.builds = builds;
    this.empty = empty;
  }

  /**
   * Shows the installations of `regionId` and the build options against
   * `state`'s treasury. With no campaign or region the placeholder shows.
   */
  update(state: GameState | undefined, regionId: RegionId | undefined): void {
    if (!this.list || !this.builds || !this.empty || !this.region) {
      return;
    }
    this.regionId = regionId;
    const region =
      state && regionId !== undefined
        ? state.overworld.map.regions.find((r) => r.id === regionId)
        : undefined;
    if (!state || !region) {
      this.region.textContent = "—";
      this.list.hidden = true;
      this.builds.hidden = true;
      this.empty.hidden = false;
      return;
    }
    this.region.textContent = region.name;
    const held = state.overworld.deployables.filter(
      (d) => d.regionId === region.id,
    );
    this.renderList(held);
    this.renderBuilds(held, state.economy.credits);
    this.list.hidden = held.length === 0;
    this.builds.hidden = false;
    this.empty.hidden = true;
  }

  /** Removes the section and its listener. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.region = undefined;
    this.list = undefined;
    this.builds = undefined;
    this.empty = undefined;
    this.regionId = undefined;
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** One row per built installation in the region. */
  private renderList(held: readonly Deployable[]): void {
    if (!this.list) {
      return;
    }
    const doc = this.list.ownerDocument;
    this.list.replaceChildren();
    for (const deployable of held) {
      const type = this.catalogue.getDeployableType(deployable.typeId);
      const row = doc.createElement("li");
      row.dataset.deployableId = deployable.id;
      row.dataset.typeId = deployable.typeId;

      const name = doc.createElement("span");
      name.className = "tut-data";
      name.textContent = type?.name ?? deployable.typeId;

      const status = doc.createElement("span");
      status.className = `tut-badge tut-badge--${deployable.online ? "ok" : "warn"}`;
      status.dataset.field = "status";
      status.textContent = deployable.online ? "online" : "offline";

      const upkeep = doc.createElement("span");
      upkeep.className = "tut-mono tut-dim";
      upkeep.textContent =
        type === undefined ? "—" : `${formatCredits(type.upkeepPerDay)}/day`;

      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "tut-btn tut-btn--danger";
      remove.dataset.action = "decommission-deployable";
      remove.textContent = "Decommission";

      row.append(name, status, upkeep, remove);
      this.list.appendChild(row);
    }
  }

  /** One Build button per catalogue type, disabled with a reason when it cannot be built. */
  private renderBuilds(held: readonly Deployable[], credits: number): void {
    if (!this.builds) {
      return;
    }
    const doc = this.builds.ownerDocument;
    this.builds.replaceChildren();
    for (const type of this.catalogue.listDeployableTypes()) {
      const count = held.filter((d) => d.typeId === type.id).length;
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "tut-btn";
      button.dataset.action = "build-deployable";
      button.dataset.typeId = type.id;
      button.textContent = `Build ${type.name} · ${formatCredits(type.buildCost)} · ${String(count)}/${String(type.maxPerRegion)}`;
      const reason = this.buildBlocker(type, count, credits);
      button.disabled = reason !== undefined;
      button.title =
        reason ??
        `${type.description} Upkeep ${formatCredits(type.upkeepPerDay)} per day.`;
      this.builds.appendChild(button);
    }
  }

  /** Why a type cannot be built right now, or undefined when it can. */
  private buildBlocker(
    type: DeployableType,
    count: number,
    credits: number,
  ): string | undefined {
    if (count >= type.maxPerRegion) {
      return `Region cap of ${String(type.maxPerRegion)} reached`;
    }
    if (credits < type.buildCost) {
      return `Need ${formatCredits(type.buildCost)}, have ${formatCredits(credits)}`;
    }
    return undefined;
  }

  // ===========================================
  // Events
  // ===========================================

  /** Routes a click on a Build or Decommission button to its handler. */
  private handleClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("button[data-action]");
    if (!button || button.disabled) {
      return;
    }
    const { action, typeId } = button.dataset;
    const deployableId = button.closest("li")?.dataset.deployableId;
    if (
      action === "build-deployable" &&
      typeId !== undefined &&
      isDeployableTypeId(typeId) &&
      this.regionId !== undefined
    ) {
      this.handlers.onBuild(typeId, this.regionId);
    } else if (action === "decommission-deployable" && deployableId) {
      this.handlers.onDecommission(deployableId);
    }
  }
}
