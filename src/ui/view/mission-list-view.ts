import type { CityId } from "../../overworld/model/city";
import type { Mission, MissionId } from "../../overworld/model/mission";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { MissionTypeCatalogue } from "../../overworld/service/mission-generation-service";
import type { GameState } from "../../save/model/game-state";
import type { OverworldSelection } from "../model/overworld-selection";
import { formatCredits, formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the list reports back to its owner. */
export interface MissionListViewHandlers {
  /** The player clicked a mission row. */
  readonly onSelectMission: (missionId: MissionId, cityId: CityId) => void;
}

/** What the list needs to name things. */
export interface MissionListViewDeps {
  readonly missionTypes: MissionTypeCatalogue;
}

// ===========================================
// MissionListView
// ===========================================

/**
 * The missions on offer, soonest to expire first: city, type, difficulty,
 * reward and days left per row, with the selected row highlighted. Rows
 * are keyed by mission id and reused across updates, so a tick that
 * changes nothing touches nothing.
 *
 * ```
 *   ┌ MISSIONS ────────────────────────────────────┐
 *   │ ▮ Cairo       Infestation clearance   D3  ¢900  4 d │
 *   │   Lagos       Infestation clearance   D5  ¢1,500 2 d │
 *   └──────────────────────────────────────────────┘
 * ```
 */
export class MissionListView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: MissionListViewDeps;
  private readonly handlers: MissionListViewHandlers;
  private root: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private empty: HTMLElement | undefined;
  private readonly rows = new Map<MissionId, HTMLElement>();
  private onClick: ((event: Event) => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param deps - Catalogue for naming mission types.
   * @param handlers - Callback for row selection.
   */
  constructor(deps: MissionListViewDeps, handlers: MissionListViewHandlers) {
    this.deps = deps;
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the section under `parent` with the empty state showing. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.className = "tut-missions";
    section.dataset.role = "missions";

    const title = doc.createElement("h3");
    title.textContent = "Missions";

    const list = doc.createElement("ul");
    list.className = "tut-list tut-missions__list";
    list.dataset.role = "mission-list";

    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-missions";
    empty.textContent = "No missions on offer. Advance the day.";

    section.append(title, list, empty);
    parent.appendChild(section);

    this.onClick = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const row = target.closest<HTMLElement>("[data-mission-id]");
      const missionId = row?.dataset.missionId;
      const cityId = row?.dataset.cityId;
      if (missionId !== undefined && cityId !== undefined) {
        this.handlers.onSelectMission(missionId, cityId);
      }
    };
    list.addEventListener("click", this.onClick);

    this.root = section;
    this.list = list;
    this.empty = empty;
  }

  /** Syncs the rows to the missions on offer and highlights the selection. */
  update(state: GameState | undefined, selection: OverworldSelection): void {
    if (!this.list || !this.empty) {
      return;
    }
    const doc = this.list.ownerDocument;
    const missions = state ? sortByExpiry(state.overworld.missions) : [];
    const keep = new Set<MissionId>();

    for (const mission of missions) {
      keep.add(mission.id);
      let row = this.rows.get(mission.id);
      if (!row) {
        row = this.createRow(doc, mission);
        this.rows.set(mission.id, row);
      }
      this.fillRow(row, mission, state);
      row.classList.toggle("is-selected", selection.missionId === mission.id);
      this.list.appendChild(row);
    }
    for (const [id, row] of this.rows) {
      if (!keep.has(id)) {
        row.remove();
        this.rows.delete(id);
      }
    }
    this.empty.hidden = missions.length > 0;
  }

  /** Removes the section and its listener. */
  unmount(): void {
    if (this.list && this.onClick) {
      this.list.removeEventListener("click", this.onClick);
    }
    this.root?.remove();
    this.root = undefined;
    this.list = undefined;
    this.empty = undefined;
    this.rows.clear();
    this.onClick = undefined;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** A row skeleton with one cell per column; values come from `fillRow`. */
  private createRow(doc: Document, mission: Mission): HTMLElement {
    const row = doc.createElement("li");
    row.className = "tut-missions__row";
    row.dataset.missionId = mission.id;
    row.dataset.cityId = mission.cityId;
    row.dataset.action = "select-mission";
    row.tabIndex = 0;
    for (const field of ["city", "type", "difficulty", "reward", "days-left"]) {
      const cell = doc.createElement("span");
      cell.dataset.field = field;
      cell.className = field === "city" || field === "type" ? "" : "tut-data";
      row.appendChild(cell);
    }
    return row;
  }

  /** Writes a mission's columns into an existing row, touching only changed text. */
  private fillRow(
    row: HTMLElement,
    mission: Mission,
    state: GameState | undefined,
  ): void {
    const city = state
      ? findCity(state.overworld.map, mission.cityId)
      : undefined;
    const day = state?.overworld.day ?? mission.createdDay;
    const values: Record<string, string> = {
      city: city?.name ?? mission.cityId,
      type: this.deps.missionTypes[mission.typeId].name,
      difficulty: `D${formatWhole(mission.difficulty)}`,
      reward: formatCredits(mission.rewards.credits),
      "days-left": `${formatWhole(mission.expiresDay - day)} d`,
    };
    for (const cell of row.querySelectorAll<HTMLElement>("[data-field]")) {
      const text = values[cell.dataset.field ?? ""] ?? "";
      if (cell.textContent !== text) {
        cell.textContent = text;
      }
    }
  }
}

// ===========================================
// Sorting
// ===========================================

/** Soonest expiry first; ties by creation day, then id, so the order is stable. */
export function sortByExpiry(missions: readonly Mission[]): Mission[] {
  return [...missions].sort(
    (a, b) =>
      a.expiresDay - b.expiresDay ||
      a.createdDay - b.createdDay ||
      a.id.localeCompare(b.id),
  );
}
