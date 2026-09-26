import { BIOME_INFO } from "../../content/data/biome-info";
import type { Mission, MissionId } from "../../overworld/model/mission";
import { findCity } from "../../overworld/service/earth-map-query-service";
import type { MissionTypeCatalogue } from "../../overworld/model/mission-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import { STORY_MISSION_TITLES } from "../data/story-mission-titles";
import type {
  BriefingRow,
  MissionPresentationCatalogue,
} from "../model/mission-presentation";
import type { SitrepPresentationCatalogue } from "../model/sitrep-presentation";
import type { StoryPresentationCatalogue } from "../model/story-presentation";
import {
  formatCredits,
  formatTechPoints,
  formatWhole,
} from "../service/format";
import { missionCountdownText } from "../service/mission-countdown";
import {
  MISSION_PRESENTATION,
  briefingFieldsOf,
} from "../service/missions/mission-presentation";
import {
  STORY_PRESENTATION,
  storyBriefingFieldsOf,
  storyBriefingRowsOf,
  storyDescriptionOf,
} from "../service/story/story-presentation";
import { SitrepTagsView } from "./sitrep-tags-view";

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
  /** The rows each type adds (ADR 0013 §2.3); the shipped table when omitted. */
  readonly presentations?: MissionPresentationCatalogue;
  /** Each sitrep's name and line (campaign arc §11); the shipped table when omitted. */
  readonly sitreps?: SitrepPresentationCatalogue;
  /** The rows and line each story mission adds (ADR 0013 §2.5); the shipped table when omitted. */
  readonly stories?: StoryPresentationCatalogue;
}

/** Shared fields before the type's own rows, in order. */
const LEAD_FIELDS = [
  "type",
  "city",
  "difficulty",
  "reward",
  "tech",
  "carcass",
] as const;

/** Shared fields after the type's own rows, in order. */
const TAIL_FIELDS = [
  "days-left",
  "biome",
  "settlement",
  "size",
  "penalty",
] as const;

type Field = (typeof LEAD_FIELDS)[number] | (typeof TAIL_FIELDS)[number];

const LABELS: Readonly<Record<Field, string>> = {
  type: "Type",
  city: "City",
  difficulty: "Difficulty",
  reward: "Reward",
  tech: "Tech reward",
  carcass: "Tech carcass",
  "days-left": "Days left",
  biome: "Biome",
  settlement: "Settlement",
  size: "Map size",
  penalty: "Ignore penalty",
};

/** One label/value pair of the grid. */
interface Slot {
  readonly term: HTMLElement;
  readonly value: HTMLElement;
}

// ===========================================
// MissionDetailsView
// ===========================================

/**
 * The selected mission's briefing: its type and description, the facts
 * the list shows, the map parameters generation will use, the ignore
 * penalty, and the Plan deployment button. Hidden when nothing is
 * selected; values are rewritten in place, never rebuilt.
 *
 * Between the shared rows sit the rows mission types add (ADR 0013
 * §2.3). Every type's slots are built once at mount; a mission shows
 * the ones its type fills and the rest stay hidden, so a clearance keeps
 * the grid it always had and a defence adds its installation and waves.
 *
 * A story mission (ADR 0013 §2.5) may add its own rows the same way,
 * ahead of its type's, and say the line under the heading in its own
 * words (#1179): Live Specimen tells the player what wins it, since its
 * type's description (a clearance's) no longer does.
 *
 * Above the grid sit the offer's sitreps, one tag row each, and only
 * when it carries any (campaign arc §11).
 *
 * The Ignore penalty row shows only when ignoring the offer costs the
 * city infestation; a type whose cost lies elsewhere (an evacuation's
 * stipend cut) freezes a penalty of 0 and says so in its own rows.
 *
 * ```
 *   Briefing · <story title, on a story mission>
 *   description (the story's, else the type's)
 *   ── sitreps (SitrepTagsView), hidden when none ──
 *   Type · City · Difficulty · Reward · Tech reward · Tech carcass
 *   ── story rows (StoryPresentation.briefingRows) ──
 *   ── type rows (MissionPresentation.briefingRows) ──
 *   Days left · Biome · Settlement · Map size · Ignore penalty
 * ```
 */
export class MissionDetailsView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: MissionDetailsViewDeps;
  private readonly presentations: MissionPresentationCatalogue;
  private readonly stories: StoryPresentationCatalogue;
  private readonly handlers: MissionDetailsViewHandlers;
  private readonly sitrepTags: SitrepTagsView;
  private root: HTMLElement | undefined;
  private title: HTMLElement | undefined;
  private description: HTMLElement | undefined;
  private plan: HTMLButtonElement | undefined;
  private readonly values = new Map<Field, HTMLElement>();
  /** The rows mission types add, keyed by their field. */
  private readonly typeSlots = new Map<string, Slot>();
  /** The rows story missions add, keyed by their field. */
  private readonly storySlots = new Map<string, Slot>();
  /** The Ignore penalty row, hidden when the offer's penalty is 0. */
  private penaltySlot: Slot | undefined;
  private shown: MissionId | undefined;
  private onPlan: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param deps - Catalogue for naming and describing mission types, and
   *   the rows each type adds.
   * @param handlers - Callback for the Plan deployment button.
   */
  constructor(
    deps: MissionDetailsViewDeps,
    handlers: MissionDetailsViewHandlers,
  ) {
    this.deps = deps;
    this.presentations = deps.presentations ?? MISSION_PRESENTATION;
    this.stories = deps.stories ?? STORY_PRESENTATION;
    this.sitrepTags = new SitrepTagsView(deps.sitreps);
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
    title.dataset.field = "briefing-heading";
    title.textContent = "Briefing";

    const description = doc.createElement("p");
    description.dataset.field = "description";

    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    for (const field of LEAD_FIELDS) {
      this.values.set(field, appendSlot(grid, field, LABELS[field]).value);
    }
    for (const { field, label } of storyBriefingFieldsOf(this.stories)) {
      this.storySlots.set(field, appendSlot(grid, field, label));
    }
    for (const { field, label } of briefingFieldsOf(this.presentations)) {
      this.typeSlots.set(field, appendSlot(grid, field, label));
    }
    for (const field of TAIL_FIELDS) {
      const slot = appendSlot(grid, field, LABELS[field]);
      this.values.set(field, slot.value);
      if (field === "penalty") {
        this.penaltySlot = slot;
      }
    }

    const plan = doc.createElement("button");
    plan.type = "button";
    plan.className = "tut-btn tut-btn--primary";
    plan.dataset.action = "plan-deployment";
    plan.textContent = "Plan deployment";

    section.append(title, description);
    this.sitrepTags.mount(section);
    section.append(grid, plan);
    parent.appendChild(section);

    this.onPlan = (): void => {
      if (this.shown !== undefined) {
        this.handlers.onPlanDeployment(this.shown);
      }
    };
    plan.addEventListener("click", this.onPlan);

    this.root = section;
    this.title = title;
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
      "days-left": missionCountdownText(mission, state.overworld.day),
      biome: BIOME_INFO[mission.mapParams.biome].name,
      settlement: mission.mapParams.settlement,
      size: mission.mapParams.size,
      penalty: `+${formatWhole(mission.ignorePenalty)} infestation`,
    };
    for (const [field, element] of this.values) {
      if (element.textContent !== values[field]) {
        element.textContent = values[field];
      }
    }
    if (this.penaltySlot) {
      const noPenalty = mission.ignorePenalty === 0;
      this.penaltySlot.term.hidden = noPenalty;
      this.penaltySlot.value.hidden = noPenalty;
    }
    fillRows(
      this.storySlots,
      storyBriefingRowsOf(mission, { state }, this.stories),
    );
    fillRows(
      this.typeSlots,
      this.presentations[mission.typeId].briefingRows(mission, { state }),
    );
    this.sitrepTags.update(mission);
    const description =
      storyDescriptionOf(mission, this.stories) ?? type.description;
    if (this.description.textContent !== description) {
      this.description.textContent = description;
    }
    const heading = briefingHeading(mission);
    if (this.title && this.title.textContent !== heading) {
      this.title.textContent = heading;
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
    this.sitrepTags.unmount();
    this.root?.remove();
    this.root = undefined;
    this.title = undefined;
    this.description = undefined;
    this.plan = undefined;
    this.values.clear();
    this.typeSlots.clear();
    this.storySlots.clear();
    this.penaltySlot = undefined;
    this.shown = undefined;
    this.onPlan = undefined;
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Shows the slots the rows fill and hides the rest, emptied, so a
 * clearance keeps the grid it always had (#1175) and a mission that is
 * not a story shows no story rows (#1179).
 *
 * @param slots - The type's or the stories' slots, keyed by field.
 * @param rows - The rows this mission fills.
 */
function fillRows(
  slots: ReadonlyMap<string, Slot>,
  rows: readonly BriefingRow[],
): void {
  const filled = new Map(rows.map((row) => [row.field, row]));
  for (const [field, slot] of slots) {
    const row = filled.get(field);
    const value = row?.value ?? "";
    if (slot.value.textContent !== value) {
      slot.value.textContent = value;
    }
    if (row && slot.term.textContent !== row.label) {
      slot.term.textContent = row.label;
    }
    slot.value.hidden = row === undefined;
    slot.term.hidden = row === undefined;
  }
}

/** "Briefing", or "Briefing · <title>" for a story mission (arc §6.9). */
function briefingHeading(mission: Mission): string {
  return mission.storyId === undefined
    ? "Briefing"
    : `Briefing · ${STORY_MISSION_TITLES[mission.storyId]}`;
}

/** Appends one term and its value cell (`data-field="detail-<field>"`) to `grid`. */
function appendSlot(grid: HTMLElement, field: string, label: string): Slot {
  const doc = grid.ownerDocument;
  const term = doc.createElement("dt");
  term.className = "tut-label";
  term.textContent = label;
  const value = doc.createElement("dd");
  value.className = "tut-mono";
  value.dataset.field = `detail-${field}`;
  grid.append(term, value);
  return { term, value };
}
