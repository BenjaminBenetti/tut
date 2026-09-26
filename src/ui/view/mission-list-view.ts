import type { CityId } from "../../overworld/model/city";
import type { Mission, MissionId } from "../../overworld/model/mission";
import type { RegionId } from "../../overworld/model/region";
import {
  findCity,
  findRegion,
} from "../../overworld/service/earth-map-query-service";
import type { MissionTypeCatalogue } from "../../overworld/model/mission-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { iconUrl } from "../data/icon-manifest";
import { STORY_MISSION_TITLES } from "../data/story-mission-titles";
import type { MissionPresentationCatalogue } from "../model/mission-presentation";
import type { SitrepPresentationCatalogue } from "../model/sitrep-presentation";
import type { OverworldSelectionSnapshot } from "../model/overworld-selection";
import {
  formatCredits,
  formatTechPoints,
  formatWhole,
} from "../service/format";
import {
  compareByExpiry,
  missionCountdownText,
  missionCountdownTitle,
} from "../service/mission-countdown";
import { MISSION_PRESENTATION } from "../service/missions/mission-presentation";
import {
  compactSitrepLabel,
  sitrepBadgeClass,
  sitrepMarker,
  sitrepTagsOf,
} from "../service/missions/sitrep-tags";

// ===========================================
// Types
// ===========================================

/** What the list reports back to its owner. */
export interface MissionListViewHandlers {
  /** The player clicked a mission row. */
  readonly onSelectMission: (missionId: MissionId, cityId: CityId) => void;
  /** The player asked for every mission rather than the selected region's (#1154). */
  readonly onShowAll: () => void;
}

/** What the list needs to name things. */
export interface MissionListViewDeps {
  readonly missionTypes: MissionTypeCatalogue;
  /** Each type's glyph (ADR 0013 §2.3); the shipped table when omitted. */
  readonly presentations?: MissionPresentationCatalogue;
  /** Each sitrep's name (campaign arc §11); the shipped table when omitted. */
  readonly sitreps?: SitrepPresentationCatalogue;
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
 * With a region selected the list holds that region's missions and the
 * heading names it; with none it holds every mission and says so
 * (#1154).
 *
 * ```
 *   ┌ MISSIONS · SUB-SAHARAN AFRICA ───────────────┐
 *   │ ▮ Cairo       Infestation clearance   D3  ¢900  4 d │
 *   │   Lagos       Infestation clearance   D5  ¢1,500 2 d │
 *   │   Accra       Crash site              D1  ¢300  —   │
 *   │   [STORY · FIRST SKYFALL]                           │
 *   └──────────────────────────────────────────────┘
 * ```
 *
 * A story offer carries its title as a badge on a second line, and a
 * reported tech carcass another.
 */
export class MissionListView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: MissionListViewDeps;
  private readonly presentations: MissionPresentationCatalogue;
  private readonly handlers: MissionListViewHandlers;
  private root: HTMLElement | undefined;
  private heading: HTMLElement | undefined;
  private showAll: HTMLButtonElement | undefined;
  private list: HTMLElement | undefined;
  private empty: HTMLElement | undefined;
  private readonly rows = new Map<MissionId, HTMLElement>();
  private onClick: ((event: Event) => void) | undefined;
  private onShowAll: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param deps - Catalogue for naming mission types, and their glyphs.
   * @param handlers - Callback for row selection.
   */
  constructor(deps: MissionListViewDeps, handlers: MissionListViewHandlers) {
    this.deps = deps;
    this.presentations = deps.presentations ?? MISSION_PRESENTATION;
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

    const header = doc.createElement("div");
    header.className = "tut-missions__header";
    const title = doc.createElement("h3");
    title.dataset.field = "missions-heading";
    title.textContent = "Missions · all";
    // The way back to every mission once a region has narrowed the
    // list: nothing on the map clears a selection, so the list offers it.
    const showAll = doc.createElement("button");
    showAll.type = "button";
    showAll.className = "tut-btn tut-missions__show-all";
    showAll.dataset.action = "show-all-missions";
    showAll.textContent = "Show all";
    showAll.hidden = true;
    header.append(title, showAll);

    const list = doc.createElement("ul");
    list.className = "tut-list tut-missions__list";
    list.dataset.role = "mission-list";

    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-missions";
    empty.textContent = "No missions on offer. Advance the day.";

    section.append(header, list, empty);
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
    this.onShowAll = (): void => {
      this.handlers.onShowAll();
    };
    showAll.addEventListener("click", this.onShowAll);

    this.root = section;
    this.heading = title;
    this.showAll = showAll;
    this.list = list;
    this.empty = empty;
  }

  /**
   * Syncs the rows to the missions on offer — those in the selected
   * region, or all of them when no region is selected — and highlights
   * the selection.
   */
  update(
    state: GameState | undefined,
    selection: OverworldSelectionSnapshot,
  ): void {
    if (!this.list || !this.empty) {
      return;
    }
    const doc = this.list.ownerDocument;
    const region =
      state && selection.regionId !== undefined
        ? findRegion(state.overworld.map, selection.regionId)
        : undefined;
    const missions = state
      ? sortByExpiry(missionsInRegion(state, region?.id))
      : [];
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
    const heading = `Missions · ${region ? region.name : "all"}`;
    if (this.heading && this.heading.textContent !== heading) {
      this.heading.textContent = heading;
    }
    if (this.showAll) {
      this.showAll.hidden = region === undefined;
    }
    const emptyText =
      region && state && state.overworld.missions.length > 0
        ? `No missions in ${region.name}.`
        : "No missions on offer. Advance the day.";
    if (this.empty.textContent !== emptyText) {
      this.empty.textContent = emptyText;
    }
  }

  /** Removes the section and its listeners. */
  unmount(): void {
    if (this.list && this.onClick) {
      this.list.removeEventListener("click", this.onClick);
    }
    if (this.showAll && this.onShowAll) {
      this.showAll.removeEventListener("click", this.onShowAll);
    }
    this.root?.remove();
    this.root = undefined;
    this.heading = undefined;
    this.showAll = undefined;
    this.list = undefined;
    this.empty = undefined;
    this.rows.clear();
    this.onClick = undefined;
    this.onShowAll = undefined;
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
    for (const field of [
      "city",
      "type",
      "difficulty",
      "reward",
      "tech",
      "days-left",
    ]) {
      const cell = doc.createElement("span");
      cell.dataset.field = field;
      cell.className =
        field === "type"
          ? "tut-icon tut-icon--sm"
          : field === "city"
            ? ""
            : "tut-data";
      row.appendChild(cell);
    }
    // A story mission goes by its own name (arc §6.9): a second line
    // under the row, shown only on a story offer.
    const story = doc.createElement("span");
    story.className = "tut-badge tut-badge--warn tut-missions__story";
    story.dataset.field = "story";
    story.title = "Story mission: pinned, it never expires";
    story.hidden = true;
    row.appendChild(story);
    // A carcass on the map is worth advertising (#1171): a second line
    // under the row, shown only when the offer reports one.
    const carcass = doc.createElement("span");
    carcass.className = "tut-badge tut-badge--info tut-missions__carcass";
    carcass.dataset.field = "carcass";
    carcass.title = "Tech carcass reported";
    carcass.hidden = true;
    row.appendChild(carcass);
    // A type may add a line of its own (ADR 0013 §2.3): a hive's level
    // and when it next grows (#1179), from the presentation's offerNote.
    const note = doc.createElement("span");
    note.className = "tut-badge tut-badge--bug tut-missions__note";
    note.dataset.field = "note";
    note.hidden = true;
    row.appendChild(note);
    // So are its sitreps (campaign arc §11): one compact tag each on a
    // line of their own, a helping one marked `+ ` as well as coloured.
    const sitreps = doc.createElement("span");
    sitreps.className = "tut-missions__sitreps";
    sitreps.dataset.field = "sitreps";
    sitreps.hidden = true;
    row.appendChild(sitreps);
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
    const type = this.deps.missionTypes[mission.typeId];
    const values: Record<string, string> = {
      city: city?.name ?? mission.cityId,
      difficulty: `D${formatWhole(mission.difficulty)}`,
      reward: formatCredits(mission.rewards.credits),
      tech: `+${formatTechPoints(mission.rewards.techPoints)}`,
      "days-left": missionCountdownText(mission, day),
    };
    const carcass = mission.mapParams.techCarcass;
    for (const cell of row.querySelectorAll<HTMLElement>("[data-field]")) {
      const field = cell.dataset.field ?? "";
      if (field === "sitreps") {
        this.fillSitreps(cell, mission);
        continue;
      }
      if (field === "story") {
        const text =
          mission.storyId === undefined
            ? ""
            : `Story · ${STORY_MISSION_TITLES[mission.storyId]}`;
        if (cell.textContent !== text) {
          cell.textContent = text;
        }
        cell.hidden = mission.storyId === undefined;
        continue;
      }
      if (field === "note") {
        const text =
          state === undefined
            ? undefined
            : this.presentations[mission.typeId]?.offerNote?.(mission, {
                state,
              });
        if (cell.textContent !== (text ?? "")) {
          cell.textContent = text ?? "";
        }
        cell.hidden = text === undefined;
        continue;
      }
      if (field === "carcass") {
        const text = carcass
          ? `Tech carcass reported · +${formatTechPoints(carcass.techPoints)}`
          : "";
        if (cell.textContent !== text) {
          cell.textContent = text;
        }
        cell.hidden = carcass === undefined;
        continue;
      }
      if (field === "type") {
        // The glyph carries it; the name stays in the tooltip, so the
        // information is still there for anyone who wants it. The name
        // used to be a text column that ellipsised at a different point
        // on every row ("Infestation ...", "Infestat...", "I..."); a
        // fixed 16 px glyph says the same and gives the width back to
        // the city. Each type's glyph is its presentation's `icon`
        // (ADR 0013 §2.3), so a new type needs no change here.
        cell.style.setProperty(
          "--icon",
          iconUrl(this.presentations[mission.typeId]?.icon ?? "mission"),
        );
        if (cell.title !== type.name) {
          cell.title = type.name;
        }
        continue;
      }
      if (field === "days-left") {
        const title = missionCountdownTitle(mission);
        if (cell.title !== title) {
          cell.title = title;
        }
      }
      const text = values[field] ?? "";
      if (cell.textContent !== text) {
        cell.textContent = text;
      }
    }
  }

  /**
   * Writes the offer's sitreps into their line as compact tags, rebuilt
   * only when the set changes, and hides the line when there are none.
   * Each tag's title carries its marker and effect, so the list keeps
   * the briefing's words within reach.
   */
  private fillSitreps(cell: HTMLElement, mission: Mission): void {
    const tags = sitrepTagsOf(mission, this.deps.sitreps);
    const key = tags.map((tag) => tag.id).join(",");
    cell.hidden = tags.length === 0;
    if (cell.dataset.sitreps === key) {
      return;
    }
    cell.dataset.sitreps = key;
    const doc = cell.ownerDocument;
    cell.replaceChildren(
      ...tags.map((tag) => {
        const badge = doc.createElement("span");
        badge.className = `tut-badge ${sitrepBadgeClass(tag)}`;
        badge.dataset.sitrep = tag.id;
        badge.textContent = compactSitrepLabel(tag);
        badge.title = `${tag.name} · ${sitrepMarker(tag)}: ${tag.effect}`;
        return badge;
      }),
    );
  }
}

// ===========================================
// Filtering and sorting
// ===========================================

/** The missions on offer in `regionId`, or every mission when it is undefined. */
export function missionsInRegion(
  state: GameState,
  regionId: RegionId | undefined,
): Mission[] {
  const missions = state.overworld.missions;
  if (regionId === undefined) {
    return [...missions];
  }
  return missions.filter(
    (mission) =>
      findCity(state.overworld.map, mission.cityId)?.regionId === regionId,
  );
}

/**
 * Soonest expiry first, pinned offers (which never lapse) after the
 * rest; ties by creation day, then id, so the order is stable.
 */
export function sortByExpiry(missions: readonly Mission[]): Mission[] {
  return [...missions].sort(
    (a, b) =>
      compareByExpiry(a, b) ||
      a.createdDay - b.createdDay ||
      a.id.localeCompare(b.id),
  );
}
