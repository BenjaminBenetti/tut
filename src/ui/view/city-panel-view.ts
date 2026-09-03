import { MISSION_TYPES } from "../../content/data/mission-types";
import type { CityId } from "../../overworld/model/city";
import { MAX_INFESTATION } from "../../overworld/model/city";
import type { Mission, MissionId } from "../../overworld/model/mission";
import {
  findCity,
  getRegion,
} from "../../overworld/service/earth-map-query-service";
import { regionInfestation } from "../../overworld/service/threat-service";
import type { GameState } from "../../save/model/game-state";
import { formatCredits, formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the city panel reports back to its owner. */
export interface CityPanelViewHandlers {
  /** The player pressed Plan deployment on the city's active mission. */
  readonly onPlanDeployment: (missionId: MissionId) => void;
}

// ===========================================
// CityPanelView
// ===========================================

/**
 * The selected city's card in the side panel (GDD §5.1, §5.4): name and
 * region, an infestation meter, the region's mean infestation, and the
 * city's active mission with a Plan deployment button. Built once in
 * `mount`; `update` rewrites the values, so a tick never rebuilds it.
 *
 * ```
 *   ┌ NEW YORK ─────────────── North America East ┐
 *   │ Infestation ▮▮▮▮▮▮░░░░ 62      Region 41    │
 *   │ Mission  Infestation Clearance · diff 4     │
 *   │          ¢1,200 · expires day 8  [Plan]     │
 *   └─────────────────────────────────────────────┘
 * ```
 */
export class CityPanelView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: CityPanelViewHandlers;
  private root: HTMLElement | undefined;
  private name: HTMLElement | undefined;
  private region: HTMLElement | undefined;
  private scale: HTMLElement | undefined;
  private meter: HTMLElement | undefined;
  private infestation: HTMLElement | undefined;
  private regionMean: HTMLElement | undefined;
  private mission: HTMLElement | undefined;
  private plan: HTMLButtonElement | undefined;
  private body: HTMLElement | undefined;
  private empty: HTMLElement | undefined;
  private missionId: MissionId | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Callbacks for the card's buttons. */
  constructor(handlers: CityPanelViewHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the card under `parent` with empty values; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.id = "city-panel";
    section.className = "tut-city";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "City";

    const name = doc.createElement("div");
    name.id = "selected-city";
    name.className = "tut-city__name";
    name.dataset.field = "city-name";
    name.textContent = "—";

    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-city";
    empty.textContent = "Select a city on the map.";

    const body = doc.createElement("div");
    body.className = "tut-stack";
    body.hidden = true;

    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    const region = this.addField(doc, grid, "Region", "region");
    const scale = this.addField(doc, grid, "Scale", "scale");
    const infestation = this.addField(doc, grid, "Infestation", "infestation");
    const regionMean = this.addField(doc, grid, "Region mean", "region-mean");

    const meter = doc.createElement("div");
    meter.className = "tut-meter tut-meter--bug";
    meter.dataset.field = "infestation-meter";
    const fill = doc.createElement("div");
    fill.className = "tut-meter__fill";
    meter.appendChild(fill);

    const missionRow = doc.createElement("div");
    missionRow.className = "tut-city__mission";
    const missionLabel = doc.createElement("span");
    missionLabel.className = "tut-label";
    missionLabel.textContent = "Mission";
    const mission = doc.createElement("span");
    mission.className = "tut-data";
    mission.dataset.field = "mission";
    mission.textContent = "—";
    const plan = doc.createElement("button");
    plan.type = "button";
    plan.className = "tut-btn tut-btn--primary";
    plan.dataset.action = "plan-deployment";
    plan.textContent = "Plan deployment";
    plan.hidden = true;
    missionRow.append(missionLabel, mission, plan);

    body.append(grid, meter, missionRow);
    section.append(title, name, empty, body);
    parent.appendChild(section);

    const onPlan = (): void => {
      if (this.missionId !== undefined) {
        this.handlers.onPlanDeployment(this.missionId);
      }
    };
    plan.addEventListener("click", onPlan);
    this.disposers.push(() => {
      plan.removeEventListener("click", onPlan);
    });

    this.root = section;
    this.name = name;
    this.region = region;
    this.scale = scale;
    this.meter = fill;
    this.infestation = infestation;
    this.regionMean = regionMean;
    this.mission = mission;
    this.plan = plan;
    this.body = body;
    this.empty = empty;
  }

  /**
   * Shows `cityId` from `state`. With no campaign or no selected city the
   * card shows its placeholder; an id that is not on the map (a stale
   * selection after a load) is treated as no selection.
   */
  update(state: GameState | undefined, cityId: CityId | undefined): void {
    if (!this.body || !this.empty || !this.name) {
      return;
    }
    const city =
      state && cityId !== undefined
        ? findCity(state.overworld.map, cityId)
        : undefined;
    if (!state || !city) {
      this.name.textContent = "—";
      this.body.hidden = true;
      this.empty.hidden = false;
      this.missionId = undefined;
      return;
    }
    const region = getRegion(state.overworld.map, city.regionId);
    this.setText(this.name, city.name);
    this.setText(this.region, region.name);
    this.setText(this.scale, city.scale);
    this.setText(this.infestation, formatWhole(city.infestation));
    this.setText(
      this.regionMean,
      formatWhole(regionInfestation(state.overworld.map, region.id)),
    );
    this.meter?.style.setProperty(
      "--value",
      `${String((100 * city.infestation) / MAX_INFESTATION)}%`,
    );
    this.updateMission(activeMission(state, city.id));
    this.body.hidden = false;
    this.empty.hidden = true;
  }

  /** Removes the card and its listeners. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.name = undefined;
    this.region = undefined;
    this.scale = undefined;
    this.meter = undefined;
    this.infestation = undefined;
    this.regionMean = undefined;
    this.mission = undefined;
    this.plan = undefined;
    this.body = undefined;
    this.empty = undefined;
    this.missionId = undefined;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Appends a label/value pair to `grid` and returns the value cell. */
  private addField(
    doc: Document,
    grid: HTMLElement,
    label: string,
    field: string,
  ): HTMLElement {
    const term = doc.createElement("dt");
    term.className = "tut-label";
    term.textContent = label;
    const value = doc.createElement("dd");
    value.className = "tut-mono";
    value.dataset.field = field;
    value.textContent = "—";
    grid.append(term, value);
    return value;
  }

  /** Writes the mission summary and shows or hides the Plan button. */
  private updateMission(mission: Mission | undefined): void {
    if (!this.mission || !this.plan) {
      return;
    }
    this.missionId = mission?.id;
    if (!mission) {
      this.setText(this.mission, "No active mission");
      this.plan.hidden = true;
      return;
    }
    const type = MISSION_TYPES[mission.typeId];
    this.setText(
      this.mission,
      `${type.name} · difficulty ${formatWhole(mission.difficulty)} · ${formatCredits(mission.rewards.credits)} · expires day ${formatWhole(mission.expiresDay)}`,
    );
    this.plan.dataset.missionId = mission.id;
    this.plan.hidden = false;
  }

  /** Writes text only when it changed, so unchanged nodes are left alone. */
  private setText(element: HTMLElement | undefined, text: string): void {
    if (element && element.textContent !== text) {
      element.textContent = text;
    }
  }
}

// ===========================================
// Queries
// ===========================================

/** The city's soonest-expiring mission, or undefined when it has none. */
export function activeMission(
  state: GameState,
  cityId: CityId,
): Mission | undefined {
  return state.overworld.missions
    .filter((mission) => mission.cityId === cityId)
    .sort((a, b) => a.expiresDay - b.expiresDay)[0];
}
