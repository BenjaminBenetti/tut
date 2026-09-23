import { BIOME_INFO } from "../../content/data/biome-info";
import type { Mission, MissionId } from "../../overworld/model/mission";
import { findCity } from "../../overworld/service/earth-map-query-service";
import { INSTALLATION_SITES } from "../../content/data/installation-sites";
import type { MissionTypeCatalogue } from "../../overworld/service/mission-generation-service";
import type { GameState } from "../../save/model/game-state";
import {
  formatCredits,
  formatTechPoints,
  formatWhole,
} from "../service/format";

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
  "tech",
  "carcass",
  "installation",
  "waves",
  "days-left",
  "biome",
  "settlement",
  "size",
  "penalty",
] as const;

type Field = (typeof FIELDS)[number];

/** Rows that only a defence has (#1175); hidden for every other type. */
const DEFENCE_FIELDS: readonly Field[] = ["installation", "waves"];

const LABELS: Readonly<Record<Field, string>> = {
  type: "Type",
  city: "City",
  difficulty: "Difficulty",
  reward: "Reward",
  tech: "Tech reward",
  carcass: "Tech carcass",
  installation: "Installation",
  waves: "Bug waves",
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
  private readonly terms = new Map<Field, HTMLElement>();
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
      this.terms.set(field, term);
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
      tech: `+${formatTechPoints(mission.rewards.techPoints)}`,
      carcass: mission.mapParams.techCarcass
        ? `Reported · +${formatTechPoints(mission.mapParams.techCarcass.techPoints)}`
        : "None reported",
      installation: mission.defence
        ? `${INSTALLATION_SITES[mission.defence.installation].name} · ${formatWhole(mission.defence.generators)} generators`
        : "",
      waves: mission.defence
        ? `${formatWhole(mission.defence.waves)} timed waves`
        : "",
      "days-left": `${formatWhole(mission.expiresDay - state.overworld.day)} d`,
      biome: BIOME_INFO[mission.mapParams.biome].name,
      settlement: mission.mapParams.settlement,
      size: mission.mapParams.size,
      penalty: `+${formatWhole(mission.ignorePenalty)} infestation`,
    };
    for (const [field, element] of this.values) {
      if (element.textContent !== values[field]) {
        element.textContent = values[field];
      }
      // A defence's rows only appear on a defence (#1175); a clearance
      // briefing keeps the grid it always had.
      if (DEFENCE_FIELDS.includes(field)) {
        const hidden = mission.defence === undefined;
        element.hidden = hidden;
        const term = this.terms.get(field);
        if (term) {
          term.hidden = hidden;
        }
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
