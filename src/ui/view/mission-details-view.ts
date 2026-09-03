import type { Mission, MissionId } from "../../overworld/model/mission";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { MissionTypeCatalogue } from "../../overworld/service/mission-generation-service";
import type { GameState } from "../../save/model/game-state";
import { formatCredits, formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the details panel reports back to its owner. */
export interface MissionDetailsViewHandlers {
  /** The player pressed Plan deployment for the shown mission. */
  readonly onPlanDeployment: (missionId: MissionId) => void;
}

/** What the panel needs to name and describe things. */
export interface MissionDetailsViewDeps {
  readonly missionTypes: MissionTypeCatalogue;
}

/** Fields shown in the label/value grid, in order. */
const FIELDS = [
  "type",
  "city",
  "difficulty",
  "reward",
  "days-left",
  "biome",
  "settlement",
  "size",
  "penalty",
] as const;

type Field = (typeof FIELDS)[number];

const LABELS: Readonly<Record<Field, string>> = {
  type: "Type",
  city: "City",
  difficulty: "Difficulty",
  reward: "Reward",
  "days-left": "Days left",
  biome: "Biome",
  settlement: "Settlement",
  size: "Map size",
  penalty: "Ignore penalty",
};

// ===========================================
// MissionDetailsView
// ===========================================

/**
 * The selected mission's briefing: its type and description, the facts
 * the list shows, the map parameters generation will use, the ignore
 * penalty, and the Plan deployment button. Hidden when nothing is
 * selected; values are rewritten in place, never rebuilt.
 */
export class MissionDetailsView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: MissionDetailsViewDeps;
  private readonly handlers: MissionDetailsViewHandlers;
  private root: HTMLElement | undefined;
  private description: HTMLElement | undefined;
  private plan: HTMLButtonElement | undefined;
  private readonly values = new Map<Field, HTMLElement>();
  private shown: MissionId | undefined;
  private onPlan: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param deps - Catalogue for naming and describing mission types.
   * @param handlers - Callback for the Plan deployment button.
   */
  constructor(
    deps: MissionDetailsViewDeps,
    handlers: MissionDetailsViewHandlers,
  ) {
    this.deps = deps;
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the hidden section under `parent`; `update` shows it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.className = "tut-mission-details";
    section.dataset.role = "mission-details";
    section.hidden = true;

    const title = doc.createElement("h3");
    title.textContent = "Briefing";

    const description = doc.createElement("p");
    description.dataset.field = "description";

    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    for (const field of FIELDS) {
      const term = doc.createElement("dt");
      term.className = "tut-label";
      term.textContent = LABELS[field];
      const value = doc.createElement("dd");
      value.className = "tut-mono";
      value.dataset.field = `detail-${field}`;
      grid.append(term, value);
      this.values.set(field, value);
    }

    const plan = doc.createElement("button");
    plan.type = "button";
    plan.className = "tut-btn tut-btn--primary";
    plan.dataset.action = "plan-deployment";
    plan.textContent = "Plan deployment";

    section.append(title, description, grid, plan);
    parent.appendChild(section);

    this.onPlan = (): void => {
      if (this.shown !== undefined) {
        this.handlers.onPlanDeployment(this.shown);
      }
    };
    plan.addEventListener("click", this.onPlan);

    this.root = section;
    this.description = description;
    this.plan = plan;
  }

  /** Shows `mission`'s briefing, or hides the section when there is none. */
  update(state: GameState | undefined, mission: Mission | undefined): void {
    if (!this.root || !this.description) {
      return;
    }
    if (!mission || !state) {
      this.shown = undefined;
      delete this.root.dataset.missionId;
      this.root.hidden = true;
      return;
    }
    const type = this.deps.missionTypes[mission.typeId];
    const city = findCity(state.overworld.map, mission.cityId);
    const values: Readonly<Record<Field, string>> = {
      type: type.name,
      city: city?.name ?? mission.cityId,
      difficulty: `D${formatWhole(mission.difficulty)}`,
      reward: formatCredits(mission.rewards.credits),
      "days-left": `${formatWhole(mission.expiresDay - state.overworld.day)} d`,
      biome: mission.mapParams.biome,
      settlement: mission.mapParams.settlement,
      size: mission.mapParams.size,
      penalty: `+${formatWhole(mission.ignorePenalty)} infestation`,
    };
    for (const [field, element] of this.values) {
      if (element.textContent !== values[field]) {
        element.textContent = values[field];
      }
    }
    if (this.description.textContent !== type.description) {
      this.description.textContent = type.description;
    }
    this.shown = mission.id;
    this.root.dataset.missionId = mission.id;
    this.root.hidden = false;
  }

  /** Removes the section and its listener. */
  unmount(): void {
    if (this.plan && this.onPlan) {
      this.plan.removeEventListener("click", this.onPlan);
    }
    this.root?.remove();
    this.root = undefined;
    this.description = undefined;
    this.plan = undefined;
    this.values.clear();
    this.shown = undefined;
    this.onPlan = undefined;
  }
}
