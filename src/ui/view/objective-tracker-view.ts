import type {
  Objective,
  ObjectiveId,
  Spawner,
} from "../../tactical/model/tactical-state";
import type {
  ObjectiveCountdown,
  ObjectiveCountdowns,
  ObjectivePresentation,
  ObjectivePresentationCatalogue,
  ObjectiveProgressReadings,
  ObjectiveRow,
  ObjectiveRowDetail,
} from "../model/objective-presentation";
import { decidingObjectives } from "../../tactical/service/objectives/objective-status";
import type { SitrepCountdown } from "../model/sitrep-presentation";
import { formatWhole } from "../service/format";
import { OBJECTIVE_PRESENTATION } from "../service/objectives/objective-presentation";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Constants
// ===========================================

/**
 * Class of a stacked row's label-over-detail column. Named for the
 * defence (#1175), the first row that needed it; the stylesheet and the
 * shipped DOM both know it by that name.
 */
const STACK_CLASS = "tut-hud__defence";

/** Class of a deadline countdown line; `data-urgent="true"` makes it pulse. */
const DEADLINE_CLASS = "tut-deadline";

// ===========================================
// ObjectiveTrackerView
// ===========================================

/**
 * The mission's objectives (GDD §6.3): one row per objective, as its
 * kind's presentation describes it (ADR 0013 §2.3). The tracker owns the
 * summary, the row's id and completion, and the `in reach` mark; the
 * kind owns the glyph, the words, its `data-*` and its numbers. Rows are
 * rebuilt on every update; there are a handful at most.
 *
 * ```
 *   OBJECTIVES  1 / 2
 *   ├ ✓ Destroyed spawner 1
 *   └ ○ Destroy spawner 2 · 20 hp · IN REACH
 *
 *   OBJECTIVES  0 / 1
 *   └ ⛨ Defend the sensor array
 *       2 / 3 generators · wave 3 / 5 · 4 bugs left
 *
 *   OBJECTIVES  0 / 1
 *   └ ○ Destroy the spore pod · 40 hp
 *       Pod matures in 2 turns            (urgent: pulses)
 *
 *   OBJECTIVES  0 / 2
 *   ├ ○ Destroy spawner 1 · 30 hp
 *   ├ ○ Destroy spawner 2 · 30 hp
 *   └ ⚠ Dust-off Window                   (a sitrep's deadline, not counted)
 *       Drop ship leaves in 5 turns
 *
 *   OBJECTIVES  0 / 1                      (the optional rows are not counted)
 *   ├ ○ Destroy spawner 1 · 20 hp · OPTIONAL
 *   └ ○ Capture a lurker
 *
 *   OBJECTIVES  0 / 1
 *   └ ◇ Tunnels sealed · 1 / 3
 *       Tunnel 2 blows in 2 turns          (a row's own countdown: data-role="fuse")
 * ```
 *
 * An optional objective (#1179, a story mission's host nests) gets its
 * row, marked `data-optional` and tagged, but the summary counts only
 * the objectives that decide the mission, so "board the drop ship"
 * never waits on one.
 *
 * The row marked `in reach` is the one Interact would work, so a player
 * with two spawners in range can see which gets the charges (#427). A
 * kind with live numbers (a defence, #1175) reads them from the readings
 * the HUD takes, since the objective record only mirrors them at phase
 * ends. An objective with a deadline gets its countdown under its label,
 * whatever its kind, from the countdowns the HUD takes, and a kind may
 * add countdowns of its own on its row (each tunnel charge's fuse, arc
 * §6.7), under the deadline. A sitrep with a
 * deadline (Dust-off Window, campaign arc §11) gets a row of its own
 * after the objectives, `data-sitrep-id`, with its countdown under its
 * name; it is not an objective, so the summary does not count it.
 */
export class ObjectiveTrackerView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly presentations: ObjectivePresentationCatalogue;
  private root: HTMLElement | undefined;
  private summary: HTMLElement | undefined;
  private list: HTMLElement | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param presentations - How each objective kind is shown; the shipped table by default. */
  constructor(
    presentations: ObjectivePresentationCatalogue = OBJECTIVE_PRESENTATION,
  ) {
    this.presentations = presentations;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the tracker under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.id = "objectives";
    section.className = "tut-panel tut-hud__objectives";
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Objectives";
    const summary = doc.createElement("div");
    summary.className = "tut-mono";
    summary.dataset.field = "objective-summary";
    const list = doc.createElement("ul");
    list.className = "tut-list";
    list.dataset.role = "objective-list";
    section.append(title, summary, list);
    parent.appendChild(section);
    this.root = section;
    this.summary = summary;
    this.list = list;
  }

  /**
   * Rebuilds the rows from the mission's objectives and spawners.
   * `inReachId` names the objective the selected unit could work now, if
   * any; its row is marked so the Interact button is never ambiguous.
   * `progress` holds the live readings the HUD took, keyed by objective
   * id; a kind that takes one falls back to its stored flags without it.
   * `countdowns` holds each open objective's deadline countdown, keyed
   * the same way; a row without one shows none. `hazards` are the
   * sitreps' running countdowns, one row each after the objectives.
   *
   * The summary counts what the rows read (`ObjectiveRow.complete`, else
   * the stored flag), so a wreck whose parts are home reads "1 / 1"
   * above a row reading "Recovered", not "0 / 1". It counts only the
   * objectives that decide the mission; an optional one is drawn but
   * not counted.
   */
  update(
    objectives: readonly Objective[],
    spawners: readonly Spawner[],
    inReachId?: ObjectiveId,
    progress?: ObjectiveProgressReadings,
    countdowns?: ObjectiveCountdowns,
    hazards: readonly SitrepCountdown[] = [],
  ): void {
    if (!this.list || !this.summary) {
      return;
    }
    const drawn = objectives.map((objective, index) => {
      const presentation: ObjectivePresentation =
        this.presentations[objective.kind];
      // The ordinal, not the target id (#949): the index is stable for
      // the length of the mission because a finished objective stays in
      // the array.
      const row = presentation.row(objective, {
        ordinal: index + 1,
        spawners,
        progress: progress?.get(objective.id),
      });
      return { objective, row, complete: row.complete ?? objective.complete };
    });
    // Only the objectives that decide the mission are counted (#1179):
    // an optional one never holds back "board the drop ship".
    const decidingIds = new Set(
      decidingObjectives(objectives).map((objective) => objective.id),
    );
    const deciding = drawn.filter((entry) =>
      decidingIds.has(entry.objective.id),
    );
    const done = deciding.filter((entry) => entry.complete).length;
    // Finishing the objectives no longer ends the mission; the force
    // has to board the drop ship. The tracker is where the player looks
    // to see what is left to do, so this is where the last step is
    // named.
    const allDone = deciding.length > 0 && done === deciding.length;
    this.summary.dataset.complete = allDone ? "true" : "false";
    this.summary.textContent = allDone
      ? `${formatWhole(done)} / ${formatWhole(deciding.length)} — board the drop ship`
      : `${formatWhole(done)} / ${formatWhole(deciding.length)}`;
    const doc = this.list.ownerDocument;
    this.list.replaceChildren();
    for (const { objective, row, complete } of drawn) {
      this.list.appendChild(
        rowElement(
          doc,
          objective,
          row,
          complete,
          objective.id === inReachId,
          countdowns?.get(objective.id),
        ),
      );
    }
    for (const hazard of hazards) {
      this.list.appendChild(sitrepRowElement(doc, hazard));
    }
  }

  /** Removes the tracker. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.summary = undefined;
    this.list = undefined;
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Draws one row: the objective's id and completion (`complete`, as the
 * summary counted it), the kind's `data-*`, then the glyph and the label
 * with the detail beside it (`inline`) or under it (`stacked`), the
 * `optional` tag on an objective that does not decide the mission
 * (#1179), and the `in reach` mark last. A countdown goes under the label
 * (and under a stacked detail), which stacks an inline row's label for it;
 * the row's own countdowns (a tunnel charge's fuse, arc §6.7) follow the
 * deadline, one line each.
 */
function rowElement(
  doc: Document,
  objective: Objective,
  row: ObjectiveRow,
  complete: boolean,
  inReach: boolean,
  countdown: ObjectiveCountdown | undefined,
): HTMLLIElement {
  const item = doc.createElement("li");
  item.dataset.objectiveId = objective.id;
  item.dataset.complete = complete ? "true" : "false";
  for (const [key, value] of Object.entries(row.data)) {
    item.dataset[key] = value;
  }
  if (inReach) {
    item.dataset.inReach = "true";
  }
  if (objective.optional === true) {
    item.dataset.optional = "true";
  }
  const glyph = iconGlyph(doc, row.icon);
  const label = doc.createElement("span");
  label.textContent = row.label;
  const detail = row.detail && detailElement(doc, row.detail);
  const timers = [
    ...(countdown ? [countdownElement(doc, countdown)] : []),
    ...(row.countdowns ?? []).map((timer) =>
      countdownElement(doc, timer, timer.role),
    ),
  ];
  if (row.layout === "stacked") {
    // The label over its detail, not beside it: "2 / 3 generators ·
    // wave 3 / 5" is wider than the rail leaves, and beside the label it
    // squeezed every word onto its own line and ran off the panel.
    const stack = doc.createElement("span");
    stack.className = STACK_CLASS;
    stack.appendChild(label);
    if (detail) {
      stack.appendChild(detail);
    }
    stack.append(...timers);
    item.append(glyph, stack);
  } else {
    if (timers.length > 0) {
      // "Pod matures in 3 turns" is as wide as the rail, so it goes
      // under the label rather than beside it, and the detail stays put.
      const stack = doc.createElement("span");
      stack.className = STACK_CLASS;
      stack.append(label, ...timers);
      item.append(glyph, stack);
    } else {
      item.append(glyph, label);
    }
    if (detail) {
      item.appendChild(detail);
    }
  }
  if (objective.optional === true) {
    const optional = doc.createElement("span");
    optional.className = "tut-mono tut-dim";
    optional.dataset.role = "optional";
    optional.textContent = "optional";
    item.appendChild(optional);
  }
  if (inReach) {
    const reach = doc.createElement("span");
    reach.className = "tut-mono";
    reach.dataset.role = "in-reach";
    reach.textContent = "in reach";
    item.appendChild(reach);
  }
  return item;
}

/**
 * Draws a sitrep's countdown row: the warning glyph, the sitrep's name
 * and its countdown under it, stacked as an objective's countdown is.
 * `data-sitrep-id` names the sitrep; it has no objective id and no
 * completion.
 */
function sitrepRowElement(
  doc: Document,
  hazard: SitrepCountdown,
): HTMLLIElement {
  const item = doc.createElement("li");
  item.dataset.sitrepId = hazard.sitrepId;
  const label = doc.createElement("span");
  label.textContent = hazard.name;
  const stack = doc.createElement("span");
  stack.className = STACK_CLASS;
  stack.append(label, countdownElement(doc, hazard));
  item.append(iconGlyph(doc, "warning"), stack);
  return item;
}

/**
 * A countdown as a monospace line, `data-role="deadline"` unless the
 * row names another role (`fuse`), with `data-urgent` saying whether it
 * pulses.
 */
function countdownElement(
  doc: Document,
  countdown: ObjectiveCountdown,
  role = "deadline",
): HTMLElement {
  const span = doc.createElement("span");
  span.className = `tut-mono ${DEADLINE_CLASS}`;
  span.dataset.role = role;
  span.dataset.urgent = countdown.urgent ? "true" : "false";
  span.textContent = countdown.text;
  return span;
}

/** A row's numbers as a dim monospace span, with its role when it has one. */
function detailElement(doc: Document, detail: ObjectiveRowDetail): HTMLElement {
  const span = doc.createElement("span");
  span.className = "tut-mono tut-dim";
  if (detail.role !== undefined) {
    span.dataset.role = detail.role;
  }
  span.textContent = detail.text;
  return span;
}
