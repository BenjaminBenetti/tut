import type { Unsubscribe } from "../../core/model/event-bus";
import type {
  DeploymentAssessment,
  DeploymentAssessor,
} from "../../overworld/model/deployment-assessment";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import { launchMission } from "../../overworld/model/launch-mission-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type { Mission } from "../../overworld/model/mission";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { MissionTypeCatalogue } from "../../overworld/service/mission-generation-service";
import type { MechId } from "../../roster/model/mech";
import type { SquadId } from "../../roster/model/squad";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import type { CampaignStore, GameSession } from "../model/game-session";
import type { OverworldSelection } from "../model/overworld-selection";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { formatCredits, formatWhole } from "../service/format";
import { DeploymentPickerView } from "../view/deployment-picker-view";

// ===========================================
// Types
// ===========================================

/** What the deployment screen needs from the app. */
export interface DeploymentScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** Carries the mission the player chose on the overworld. */
  readonly selection: OverworldSelection;
  /** Rates the pick the way the resolver will. */
  readonly assessor: DeploymentAssessor;
  /** Names squad types in the checklist. */
  readonly squadTypes: SquadTypeCatalogue;
  /** Names mission types in the briefing. */
  readonly missionTypes: MissionTypeCatalogue;
  /**
   * True when the session resolves missions with the M1 auto-resolver
   * (`?autoResolve=1`, #341): Launch settles the mission on the spot and
   * opens the results. Absent or false is the shipped game, where Launch
   * starts a tactical mission and opens the tactical screen.
   */
  readonly autoResolve?: boolean;
}

/** Fields of the briefing grid, in order. */
const BRIEF_FIELDS = [
  "mission-id",
  "type",
  "city",
  "difficulty",
  "reward",
  "days-left",
] as const;

type BriefField = (typeof BRIEF_FIELDS)[number];

const BRIEF_LABELS: Readonly<Record<BriefField, string>> = {
  "mission-id": "Mission",
  type: "Type",
  city: "City",
  difficulty: "Difficulty",
  reward: "Reward",
  "days-left": "Days left",
};

// ===========================================
// DeploymentScreen
// ===========================================

/**
 * Choose who goes (GDD §4): the briefing of the selected mission, a
 * checklist of the roster's squads and mechs (wiped and destroyed units
 * are already gone from the roster), the resolver's own force-versus-
 * difficulty readout for the current pick, and Launch. Launch starts the
 * tactical mission and hands over to the tactical screen; with
 * `autoResolve` on it settles the mission where it stands instead.
 *
 * ```
 *   ┌ #deployment-bar  DEPLOYMENT · Cairo ──────── status ── [Back] [LAUNCH] ┐
 *   ├──────────────────────────────────┬───────────────────────────────────┤
 *   │  checklist (squads, mechs)       │  briefing                          │
 *   │  FORCE · EVEN FIGHT · WIN CHANCE │                                    │
 *   └──────────────────────────────────┴───────────────────────────────────┘
 *
 *   checkbox ──► selected ids ──► assessor.assess ──► picker.update
 *   [Launch]  ──► dispatch(startMission(id, deployment))  ──ok──► "tactical"
 *                 dispatch(launchMission(id, deployment)) ──ok──► "mission-results"
 *                   (auto-resolve)                        ──err─► status
 * ```
 *
 * The pick is screen-local UI state: it is rebuilt from the roster on
 * every store change so a unit that vanished cannot stay selected.
 */
export class DeploymentScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "deployment";
  private readonly deps: DeploymentScreenDeps;
  private readonly picker: DeploymentPickerView;
  private readonly selectedSquads = new Set<SquadId>();
  private readonly selectedMechs = new Set<MechId>();
  private root: HTMLElement | undefined;
  private title: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private launch: HTMLButtonElement | undefined;
  private noMission: HTMLElement | undefined;
  private readonly brief = new Map<BriefField, HTMLElement>();
  private unsubscribe: Unsubscribe | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session, selection, assessor and catalogues. */
  constructor(deps: DeploymentScreenDeps) {
    this.deps = deps;
    this.picker = new DeploymentPickerView(
      { squadTypes: deps.squadTypes },
      {
        onToggleSquad: (squadId, selected) => {
          this.toggle(this.selectedSquads, squadId, selected);
        },
        onToggleMech: (mechId, selected) => {
          this.toggle(this.selectedMechs, mechId, selected);
        },
      },
    );
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the bar, the checklist and the briefing, and subscribes to the store. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const layout = doc.createElement("section");
    layout.className = "tut-deployment";
    layout.dataset.screen = this.id;

    layout.appendChild(this.createBar(doc));

    const body = doc.createElement("div");
    body.className = "tut-deployment__body";
    this.picker.mount(body);
    body.appendChild(this.createBriefing(doc));
    layout.appendChild(body);

    root.appendChild(layout);
    this.root = layout;

    const store = this.deps.session.store;
    this.render(store?.getState());
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state);
    });
  }

  /** Unsubscribes, unmounts the picker and removes the layout. */
  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.picker.unmount();
    this.root?.remove();
    this.root = undefined;
    this.title = undefined;
    this.status = undefined;
    this.launch = undefined;
    this.noMission = undefined;
    this.brief.clear();
  }

  // ===========================================
  // Actions
  // ===========================================

  /** Adds or removes a unit id from a pick and re-renders. */
  private toggle(pick: Set<string>, id: string, selected: boolean): void {
    if (selected) {
      pick.add(id);
    } else {
      pick.delete(id);
    }
    this.render(this.deps.session.store?.getState());
  }

  /**
   * Commits the pick: `StartMission` in the shipped game, which opens the
   * tactical screen, or `LaunchMission` under `autoResolve`, which
   * settles it and opens the results. A refusal stays on this screen with
   * its reason in the status line.
   */
  private launchMission(): void {
    const store: CampaignStore | undefined = this.deps.session.store;
    const mission = this.currentMission(store?.getState());
    if (!store || !mission) {
      this.showStatus("No mission selected.");
      return;
    }
    if (this.selectedSquads.size + this.selectedMechs.size === 0) {
      this.showStatus("Pick at least one unit.");
      return;
    }
    const deployment = {
      missionId: mission.id,
      squadIds: [...this.selectedSquads],
      mechIds: [...this.selectedMechs],
    };
    const auto = this.deps.autoResolve ?? false;
    const result = store.dispatch(
      auto
        ? launchMission(mission.id, deployment)
        : startMission(mission.id, deployment),
    );
    if (!result.ok) {
      // A refusal because a mission is already running is the one the
      // player can act on, so say where to act (#468).
      this.showStatus(
        result.error.code === "mission-active"
          ? `${result.error.message} Use Resume mission on the overworld to go back to it.`
          : result.error.message,
      );
      return;
    }
    this.deps.router.navigate(auto ? "mission-results" : "tactical");
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** Rebuilds the pick against the roster, then pushes state into the bar, briefing and picker. */
  private render(state: GameState | undefined): void {
    const mission = this.currentMission(state);
    const squads = state?.roster.squads ?? [];
    const mechs = state?.roster.mechs ?? [];
    this.prune(
      this.selectedSquads,
      squads.map((s) => s.id),
    );
    this.prune(
      this.selectedMechs,
      mechs.map((m) => m.id),
    );

    this.renderBriefing(state, mission);
    const assessment = this.assess(state, mission);
    this.picker.update({
      squads,
      mechs,
      selectedSquadIds: this.selectedSquads,
      selectedMechIds: this.selectedMechs,
      maxUnits: MAX_DEPLOYED_UNITS,
      assessment,
    });
    if (this.launch) {
      this.launch.disabled =
        mission === undefined ||
        this.selectedSquads.size + this.selectedMechs.size === 0;
    }
  }

  /** The selected mission if it is still on offer. */
  private currentMission(state: GameState | undefined): Mission | undefined {
    const missionId = this.deps.selection.missionId;
    if (!state || missionId === undefined) {
      return undefined;
    }
    return state.overworld.missions.find((m) => m.id === missionId);
  }

  /** The resolver-side rating of the current pick, or undefined without a mission. */
  private assess(
    state: GameState | undefined,
    mission: Mission | undefined,
  ): DeploymentAssessment | undefined {
    if (!state || !mission) {
      return undefined;
    }
    const city = findCity(state.overworld.map, mission.cityId);
    if (!city) {
      return undefined;
    }
    return this.deps.assessor.assess(
      mission,
      {
        missionId: mission.id,
        squadIds: [...this.selectedSquads],
        mechIds: [...this.selectedMechs],
      },
      { squads: state.roster.squads, mechs: state.roster.mechs, city },
    );
  }

  /** Fills the briefing grid, or shows the no-mission note. */
  private renderBriefing(
    state: GameState | undefined,
    mission: Mission | undefined,
  ): void {
    if (!this.noMission || !this.title) {
      return;
    }
    if (!state || !mission) {
      this.noMission.hidden = false;
      this.title.textContent = "No mission selected";
      for (const cell of this.brief.values()) {
        cell.textContent = "—";
      }
      return;
    }
    this.noMission.hidden = true;
    const city = findCity(state.overworld.map, mission.cityId);
    const cityName = city?.name ?? mission.cityId;
    this.title.textContent = `${this.deps.missionTypes[mission.typeId].name} · ${cityName}`;
    const values: Readonly<Record<BriefField, string>> = {
      "mission-id": mission.id,
      type: this.deps.missionTypes[mission.typeId].name,
      city: cityName,
      difficulty: `D${formatWhole(mission.difficulty)}`,
      reward: formatCredits(mission.rewards.credits),
      "days-left": `${formatWhole(mission.expiresDay - state.overworld.day)} d`,
    };
    for (const [field, cell] of this.brief) {
      if (cell.textContent !== values[field]) {
        cell.textContent = values[field];
      }
    }
  }

  /** Drops ids that are no longer in the roster. */
  private prune(pick: Set<string>, existing: readonly string[]): void {
    const keep = new Set(existing);
    for (const id of [...pick]) {
      if (!keep.has(id)) {
        pick.delete(id);
      }
    }
  }

  /** Shows a one-line message in the bar. */
  private showStatus(message: string): void {
    if (this.status) {
      this.status.textContent = message;
      this.status.hidden = false;
    }
  }

  // ===========================================
  // Construction helpers
  // ===========================================

  /** The status strip: title, status slot, Back and Launch. */
  private createBar(doc: Document): HTMLElement {
    const bar = doc.createElement("header");
    bar.id = "deployment-bar";
    bar.className = "tut-topbar tut-deployment__bar";

    const label = doc.createElement("span");
    label.className = "tut-label";
    label.textContent = "Deployment";
    const title = doc.createElement("span");
    title.className = "tut-mono";
    title.dataset.field = "mission-title";
    const spacer = doc.createElement("span");
    spacer.className = "tut-topbar__spacer";
    const status = doc.createElement("span");
    status.className = "tut-topbar__status tut-dim";
    status.dataset.role = "status";
    status.hidden = true;

    const back = this.createButton(doc, "back-to-overworld", "Back", false);
    const launch = this.createButton(doc, "launch", "Launch", true);
    launch.disabled = true;

    bar.append(label, title, spacer, status, back, launch);
    this.listen(back, () => {
      this.deps.router.navigate("overworld");
    });
    this.listen(launch, () => {
      this.launchMission();
    });

    this.title = title;
    this.status = status;
    this.launch = launch;
    return bar;
  }

  /** The briefing card with its label/value grid. */
  private createBriefing(doc: Document): HTMLElement {
    const panel = doc.createElement("section");
    panel.className = "tut-panel tut-deployment__brief";
    panel.dataset.role = "briefing";
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Briefing";
    const note = doc.createElement("p");
    note.className = "tut-dim";
    note.dataset.role = "no-mission";
    note.textContent = "No mission selected. Pick one on the overworld.";
    note.hidden = true;
    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    for (const field of BRIEF_FIELDS) {
      const term = doc.createElement("dt");
      term.className = "tut-label";
      term.textContent = BRIEF_LABELS[field];
      const value = doc.createElement("dd");
      value.className = "tut-mono";
      value.dataset.field = field;
      value.textContent = "—";
      grid.append(term, value);
      this.brief.set(field, value);
    }
    panel.append(title, note, grid);
    this.noMission = note;
    return panel;
  }

  /** Builds a themed button carrying its `data-action`. */
  private createButton(
    doc: Document,
    action: string,
    label: string,
    primary: boolean,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = primary ? "tut-btn tut-btn--primary" : "tut-btn";
    button.dataset.action = action;
    button.textContent = label;
    return button;
  }

  /** Attaches a click handler and remembers how to remove it. */
  private listen(target: HTMLElement, handler: () => void): void {
    target.addEventListener("click", handler);
    this.disposers.push(() => {
      target.removeEventListener("click", handler);
    });
  }
}
