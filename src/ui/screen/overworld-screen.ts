import type { Unsubscribe } from "../../core/model/event-bus";
import { advanceDay } from "../../overworld/model/advance-day-command";
import { buildDeployable } from "../../overworld/model/build-deployable-command";
import { decommissionDeployable } from "../../overworld/model/decommission-deployable-command";
import type { DeployableId } from "../../overworld/model/deployable";
import type { DeployableTypeCatalogue } from "../../overworld/model/deployable-type-catalogue";
import type { CityId } from "../../overworld/model/city";
import type { EventTypeCatalogue } from "../../overworld/model/event-type-catalogue";
import type { HiveTuning } from "../../overworld/model/hive-tuning";
import type { MissionId } from "../../overworld/model/mission";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { resolveEvent } from "../../overworld/model/resolve-event-command";
import { upgradeDeployable } from "../../overworld/model/upgrade-deployable-command";
import type { MissionTypeCatalogue } from "../../overworld/service/mission-generation-service";
import type { GameState } from "../../save/model/game-state";
import type { CityPickSource } from "../model/city-pick-source";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { InstallationPickSource } from "../model/installation-pick-source";
import type { MapViewportHost } from "../model/map-viewport-host";
import type {
  OverworldSelection,
  OverworldSelectionSnapshot,
} from "../model/overworld-selection";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { buildCityWheel, cityWheelChoice } from "../service/city-wheel";
import {
  buildInstallationWheel,
  installationWheelChoice,
} from "../service/installation-wheel";
import { DeployablesView } from "../view/deployables-view";
import { EventDialogView } from "../view/event-dialog-view";
import { MissionDetailsView } from "../view/mission-details-view";
import { MissionListView } from "../view/mission-list-view";
import type {
  RadialMenuHub,
  RadialMenuItem,
  ScreenAnchor,
} from "../view/radial-menu-view";
import { RadialMenuView } from "../view/radial-menu-view";
import { RegionPanelView } from "../view/region-panel-view";
import { SidePanelView } from "../view/side-panel-view";
import { TopBarView } from "../view/top-bar-view";

// ===========================================
// Types
// ===========================================

/** What the overworld screen needs from the app. */
export interface OverworldScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** Shared city + mission selection; the map wiring writes into it too. */
  readonly selection: OverworldSelection;
  /** Names, costs and caps for the deployables section. */
  readonly deployableTypes: DeployableTypeCatalogue;
  /** Names and describes mission types for the list and briefing. */
  readonly missionTypes: MissionTypeCatalogue;
  /** Copy and choices for the pending event dialog. */
  readonly eventTypes: EventTypeCatalogue;
  /** How fast a hive levels, for the region card's hive line (campaign arc §6.5). */
  readonly hiveTuning: HiveTuning;
  /** Lends the map canvas to the layout's map cell while mounted; absent in unit tests. */
  readonly mapViewport?: MapViewportHost;
  /** Pointer picks on the map and where a city's marker is, for the city wheel (#1154); absent in unit tests. */
  readonly cityPicks?: CityPickSource;
  /** Pointer picks on installations and where their models are, for the installation wheel (#1155); absent in unit tests. */
  readonly installationPicks?: InstallationPickSource;
}

/** What the one wheel is open at: a city's marker or an installation's model. */
type WheelTarget =
  | { readonly kind: "city"; readonly cityId: CityId }
  | { readonly kind: "installation"; readonly deployableId: DeployableId };

/** What a target's ring shows. */
interface WheelSpec {
  readonly hub: RadialMenuHub;
  readonly items: readonly RadialMenuItem[];
}

// ===========================================
// OverworldScreen
// ===========================================

/**
 * The overworld (GDD §5): the Earth map laid out beside its panels. On
 * mount the screen borrows the app's map viewport into `#map-area`, so
 * the scene resizes to the cell and no marker sits under a panel; on
 * unmount it hands the viewport back. The top bar reads day, credits and
 * threat; the side panel shows the selected region with its cities, the
 * missions on offer there, the open briefing and the region's
 * deployables; every store or selection change re-renders the views
 * incrementally.
 *
 * Selection is region-first (#1154). A city picked on the map opens the
 * city wheel — the tactical ring (ADR 0007) at the marker, infestation
 * and population at the hub, the missions offered there as entries —
 * and the Situation panel shows that city's region. An installation
 * picked on the map opens the installation wheel on its model (#1155):
 * level at the hub, Upgrade, Decommission and Region on the ring, with
 * its region shown in the panel. One `RadialMenuView` serves both.
 *
 * ```
 *   ┌ #top-bar ──────────────────────────────────────────────────────┐
 *   ├──────────────────────────────────────────────┬─────────────────┤
 *   │  #map-area ▸ #map-viewport ▸ canvas          │  #side-panel    │
 *   │  (wheel, keys and city picking)              │  situation      │
 *   │     #radial-menu — the city wheel, on the    │  #region-panel  │
 *   │     picked marker, following the camera      │  missions       │
 *   │                                              │  briefing       │
 *   │                                              │  #deployables   │
 *   │  [event dialog over everything while an event waits]           │
 *   └──────────────────────────────────────────────┴─────────────────┘
 *
 *   store.subscribe / selection.subscribe ──► render(state): every view
 *   [Advance day]        ──► store.dispatch(advanceDay())
 *   [Build …]            ──► store.dispatch(buildDeployable(type, region))
 *   [Upgrade …]          ──► store.dispatch(upgradeDeployable(id))
 *   [Decommission]       ──► store.dispatch(decommissionDeployable(id))
 *   event choice         ──► store.dispatch(resolveEvent(eventId, choiceId))
 *                            any rejection ──► topBar.showStatus
 *   [Roster] / [Main menu] ──► router.navigate
 *   [Resume mission]     ──► router.navigate("tactical")   while one is live
 *   mission row          ──► selection.selectMission(id, cityId)
 *   [Show all]           ──► selection.selectRegion(undefined)
 *   city row             ──► selection.select(cityId)
 *   map pick             ──► cityPicks.onCityPicked ──► wheel.open at the marker
 *   installation pick    ──► installationPicks.onInstallationPicked ──► wheel.open at the model
 *   wheel mission entry  ──► selection.selectMission(id, cityId)
 *   wheel Upgrade entry  ──► store.dispatch(upgradeDeployable(id))
 *   wheel Decommission   ──► store.dispatch(decommissionDeployable(id))
 *   wheel Region entry   ──► regionPanel.focus()
 *   [Plan deployment]    ──► selection.selectMission + router.navigate("deployment")
 *   state.overworld.outcome set ──► router.navigate("game-over")  (next microtask)
 * ```
 *
 * The game-over hand-off is deferred one microtask because `render` can
 * run inside `mount`, and a router does not expect a screen to navigate
 * away while it is still being mounted.
 */
export class OverworldScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "overworld";
  private readonly deps: OverworldScreenDeps;
  private readonly topBar: TopBarView;
  private readonly sidePanel = new SidePanelView();
  private readonly regionPanel: RegionPanelView;
  private readonly missionList: MissionListView;
  private readonly missionDetails: MissionDetailsView;
  private readonly deployables: DeployablesView;
  private readonly eventDialog: EventDialogView;
  private readonly wheel: RadialMenuView;
  /** What the wheel is open at, or undefined while it is closed. */
  private wheelTarget: WheelTarget | undefined;
  private stopFollowing: (() => void) | undefined;
  private root: HTMLElement | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private unsubscribeSelection: Unsubscribe | undefined;
  private unsubscribePicks: Unsubscribe | undefined;
  private unsubscribeInstallationPicks: Unsubscribe | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session, selection state and content. */
  constructor(deps: OverworldScreenDeps) {
    this.deps = deps;
    this.topBar = new TopBarView({
      onAdvanceDay: () => {
        this.advanceDay();
      },
      onMainMenu: () => {
        this.deps.router.navigate("main-menu");
      },
      onRoster: () => {
        this.deps.router.navigate("roster");
      },
      onTechTree: () => {
        this.deps.router.navigate("tech-tree");
      },
      // A mission left through the HUD's Overworld button is still in
      // progress; without this the campaign is stuck, because the only
      // ways into the tactical screen are Launch and Continue (#468).
      onResumeMission: () => {
        this.deps.router.navigate("tactical");
      },
    });
    this.regionPanel = new RegionPanelView(
      {
        onSelectCity: (cityId) => {
          this.deps.selection.select(cityId);
        },
      },
      { hiveTuning: deps.hiveTuning },
    );
    this.wheel = new RadialMenuView({
      onSelect: (id) => {
        this.chooseFromWheel(id);
      },
      onDismiss: () => {
        this.closeWheel();
      },
    });
    this.missionList = new MissionListView(
      { missionTypes: deps.missionTypes },
      {
        onSelectMission: (missionId, cityId) => {
          this.deps.selection.selectMission(missionId, cityId);
        },
        onShowAll: () => {
          this.deps.selection.selectRegion(undefined);
        },
      },
    );
    this.missionDetails = new MissionDetailsView(
      { missionTypes: deps.missionTypes },
      {
        onPlanDeployment: (missionId) => {
          this.planDeployment(missionId);
        },
      },
    );
    this.deployables = new DeployablesView(
      {
        onBuild: (typeId, regionId) => {
          this.dispatch(buildDeployable(typeId, regionId));
        },
        onDecommission: (deployableId) => {
          this.dispatch(decommissionDeployable(deployableId));
        },
        onUpgrade: (deployableId) => {
          this.dispatch(upgradeDeployable(deployableId));
        },
      },
      deps.deployableTypes,
    );
    this.eventDialog = new EventDialogView(
      { eventTypes: deps.eventTypes },
      {
        onChoose: (eventId, choiceId) => {
          this.dispatch(resolveEvent(eventId, choiceId));
        },
      },
    );
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the layout, mounts the views and subscribes to the store and the selection. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const layout = doc.createElement("section");
    layout.className = "tut-overworld";
    layout.dataset.screen = this.id;

    this.topBar.mount(layout);

    const mapArea = doc.createElement("div");
    mapArea.id = "map-area";
    mapArea.className = "tut-overworld__map";
    layout.appendChild(mapArea);

    this.sidePanel.mount(layout);
    const sections = this.sidePanel.container ?? layout;
    this.regionPanel.mount(sections);
    this.missionList.mount(sections);
    this.missionDetails.mount(sections);
    this.deployables.mount(sections);
    // The wheel is positioned in client pixels, so it lives on the
    // layout, which fills the window, rather than in the map cell.
    this.wheel.mount(layout);
    this.eventDialog.mount(layout);
    root.appendChild(layout);
    this.root = layout;
    this.deps.mapViewport?.attach(mapArea);
    this.unsubscribePicks = this.deps.cityPicks?.onCityPicked((cityId) => {
      this.openWheel({ kind: "city", cityId });
    });
    this.unsubscribeInstallationPicks =
      this.deps.installationPicks?.onInstallationPicked((deployableId) => {
        this.openWheel({ kind: "installation", deployableId });
      });

    const store = this.deps.session.store;
    // Subscribe to the selection before the first render: rendering with
    // a selected mission that is no longer on offer (just launched, or
    // expired) clears the selection and relies on this subscription to
    // render again with it cleared (#83).
    this.unsubscribeSelection = this.deps.selection.subscribe((selection) => {
      // Another selection dismisses the wheel (ADR 0007 §2.2): the ring
      // belongs to the thing it opened on, not to whatever is picked
      // next.
      if (
        this.wheelTarget &&
        !this.wheelBelongsTo(this.wheelTarget, selection)
      ) {
        this.closeWheel();
      }
      this.render(this.deps.session.store?.getState());
    });
    this.render(store?.getState());
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state);
    });
  }

  /** Returns the viewport, unsubscribes, unmounts the views and removes the layout. */
  unmount(): void {
    this.deps.mapViewport?.release();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.unsubscribeSelection?.();
    this.unsubscribeSelection = undefined;
    this.unsubscribePicks?.();
    this.unsubscribePicks = undefined;
    this.unsubscribeInstallationPicks?.();
    this.unsubscribeInstallationPicks = undefined;
    this.closeWheel();
    this.wheel.unmount();
    this.eventDialog.unmount();
    this.topBar.unmount();
    this.deployables.unmount();
    this.missionDetails.unmount();
    this.missionList.unmount();
    this.regionPanel.unmount();
    this.sidePanel.unmount();
    this.root?.remove();
    this.root = undefined;
  }

  // ===========================================
  // Actions
  // ===========================================

  /** Dispatches `AdvanceDay`; a rejection is shown in the bar, never thrown. */
  private advanceDay(): void {
    this.dispatch(advanceDay());
  }

  /** Runs a command through the campaign store; a rejection is shown in the bar, never thrown. */
  private dispatch(command: OverworldCommand): void {
    const store: CampaignStore | undefined = this.deps.session.store;
    if (!store) {
      this.topBar.showStatus("No active campaign.");
      return;
    }
    const result = store.dispatch(command);
    if (!result.ok) {
      this.topBar.showStatus(result.error.message);
    }
  }

  /**
   * Opens the deployment screen for a mission: the mission (and its city)
   * is put into the shared selection, which the deployment screen reads
   * on mount. A mission that is no longer on offer is reported instead.
   */
  private planDeployment(missionId: MissionId): void {
    const mission = this.deps.session.state?.overworld.missions.find(
      (m) => m.id === missionId,
    );
    if (!mission) {
      this.topBar.showStatus("That mission is no longer on offer.");
      return;
    }
    this.deps.selection.selectMission(mission.id, mission.cityId);
    this.deps.router.navigate("deployment");
  }

  // ===========================================
  // Wheel (#1154, #1155)
  // ===========================================

  /**
   * Opens (or reopens) the wheel at `target` and starts following it.
   * Nothing opens for a thing that is not in the campaign, has no
   * campaign behind it, or is not currently drawn.
   */
  private openWheel(target: WheelTarget): void {
    const anchor = this.anchorOf(target);
    const spec = this.specFor(target);
    if (!spec || !anchor) {
      this.closeWheel();
      return;
    }
    this.wheel.open(spec.items, spec.hub, anchor);
    if (!this.wheelTarget || !sameTarget(this.wheelTarget, target)) {
      this.wheelTarget = target;
      this.stopFollowing?.();
      this.stopFollowing = undefined;
      this.follow(target);
    }
  }

  /** Hides the wheel and stops following its target. No-op while closed. */
  private closeWheel(): void {
    this.stopFollowing?.();
    this.stopFollowing = undefined;
    this.wheelTarget = undefined;
    if (this.wheel.isOpen) {
      this.wheel.close();
    }
  }

  /** Redraws an open wheel from the latest state: a tick can add or expire missions, an upgrade changes the level. */
  private refreshWheel(): void {
    if (this.wheelTarget !== undefined) {
      this.openWheel(this.wheelTarget);
    }
  }

  /** The ring and hub for a target from the current state, or undefined when it has nothing to show. */
  private specFor(target: WheelTarget): WheelSpec | undefined {
    const state = this.deps.session.state;
    if (!state) {
      return undefined;
    }
    return target.kind === "city"
      ? buildCityWheel(state, target.cityId, this.deps.missionTypes)
      : buildInstallationWheel(
          state,
          target.deployableId,
          this.deps.deployableTypes,
        );
  }

  /** Where a target is on screen now, or undefined when the map is not drawing it. */
  private anchorOf(target: WheelTarget): ScreenAnchor | undefined {
    return target.kind === "city"
      ? this.deps.cityPicks?.cityScreenPosition(target.cityId)
      : this.deps.installationPicks?.installationScreenPosition(
          target.deployableId,
        );
  }

  /**
   * Whether the selection still names what the wheel is open at: the
   * city itself, or the installation's region with no city chosen.
   */
  private wheelBelongsTo(
    target: WheelTarget,
    selection: OverworldSelectionSnapshot,
  ): boolean {
    if (target.kind === "city") {
      return selection.cityId === target.cityId;
    }
    const regionId = this.deps.session.state?.overworld.deployables.find(
      (d) => d.id === target.deployableId,
    )?.regionId;
    return (
      selection.cityId === undefined &&
      regionId !== undefined &&
      selection.regionId === regionId
    );
  }

  /**
   * Keeps the open wheel on its target between frames (ADR 0007 §2.1):
   * once a frame, while it is open, the target is projected again and
   * the ring moved to it, so a pan or zoom carries the ring with it. A
   * target that stops being drawn dismisses it (§2.2).
   */
  private follow(target: WheelTarget): void {
    const schedule =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : undefined;
    if (schedule === undefined) {
      return;
    }
    let handle = 0;
    const tick = (): void => {
      if (!this.wheelTarget || !sameTarget(this.wheelTarget, target)) {
        return;
      }
      const anchor = this.anchorOf(target);
      if (anchor === undefined) {
        this.closeWheel();
        return;
      }
      this.wheel.moveTo(anchor);
      handle = schedule(tick);
    };
    handle = schedule(tick);
    this.stopFollowing = () => {
      cancelAnimationFrame(handle);
    };
  }

  /**
   * Acts on a wheel entry. At a city: a mission opens its briefing,
   * Region lands on the region panel. At an installation: Upgrade and
   * Decommission dispatch their commands, Region lands on the panel.
   * The wheel closes either way (ADR 0007 §2.2).
   */
  private chooseFromWheel(itemId: string): void {
    const target = this.wheelTarget;
    this.closeWheel();
    if (target === undefined) {
      return;
    }
    if (target.kind === "city") {
      const choice = cityWheelChoice(itemId);
      if (choice?.kind === "mission") {
        this.deps.selection.selectMission(choice.missionId, target.cityId);
      } else if (choice?.kind === "region") {
        this.regionPanel.focus();
      }
      return;
    }
    const choice = installationWheelChoice(itemId);
    switch (choice?.kind) {
      case "upgrade":
        this.dispatch(upgradeDeployable(target.deployableId));
        return;
      case "decommission":
        this.dispatch(decommissionDeployable(target.deployableId));
        return;
      case "region":
        this.regionPanel.focus();
        return;
      case undefined:
        return;
    }
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Routes to the game-over screen on the next microtask if this screen is still up and the campaign is still over. */
  private scheduleGameOver(): void {
    queueMicrotask(() => {
      if (
        this.root === undefined ||
        this.deps.router.current !== this.id ||
        this.deps.session.state?.overworld.outcome === undefined
      ) {
        return;
      }
      this.deps.router.navigate("game-over");
    });
  }

  /**
   * Pushes the state and the current selection into every view, or hands
   * over once the campaign has ended. A selected mission that is no
   * longer on offer (expired or launched) is deselected first, which
   * re-enters here through the selection subscription.
   */
  private render(state: GameState | undefined): void {
    if (state?.overworld.outcome !== undefined) {
      this.scheduleGameOver();
    }
    const selection = this.deps.selection.selection;
    const mission =
      state && selection.missionId !== undefined
        ? state.overworld.missions.find((m) => m.id === selection.missionId)
        : undefined;
    if (selection.missionId !== undefined && mission === undefined) {
      this.deps.selection.clearMission();
      return;
    }
    this.topBar.update(state);
    this.sidePanel.update(state);
    this.regionPanel.update(state, selection);
    this.deployables.update(state, selection.regionId);
    this.missionList.update(state, selection);
    this.missionDetails.update(state, mission);
    this.eventDialog.update(state);
    this.refreshWheel();
  }
}

// ===========================================
// Helpers
// ===========================================

/** True when two wheel targets name the same thing. */
function sameTarget(a: WheelTarget, b: WheelTarget): boolean {
  return a.kind === "city"
    ? b.kind === "city" && a.cityId === b.cityId
    : b.kind === "installation" && a.deployableId === b.deployableId;
}
