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
 * ```
 *
 * The row marked `in reach` is the one Interact would work, so a player
 * with two spawners in range can see which gets the charges (#427). A
 * kind with live numbers (a defence, #1175) reads them from the readings
 * the HUD takes, since the objective record only mirrors them at phase
 * ends. An objective with a deadline gets its countdown under its label,
 * whatever its kind, from the countdowns the HUD takes.
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
   * the same way; a row without one shows none.
   */
  update(
    objectives: readonly Objective[],
    spawners: readonly Spawner[],
    inReachId?: ObjectiveId,
    progress?: ObjectiveProgressReadings,
    countdowns?: ObjectiveCountdowns,
  ): void {
    if (!this.list || !this.summary) {
      return;
    }
    const done = objectives.filter((o) => o.complete).length;
    // Finishing the objectives no longer ends the mission; the force
    // has to board the drop ship. The tracker is where the player looks
    // to see what is left to do, so this is where the last step is
    // named.
    const allDone = objectives.length > 0 && done === objectives.length;
    this.summary.dataset.complete = allDone ? "true" : "false";
    this.summary.textContent = allDone
      ? `${formatWhole(done)} / ${formatWhole(objectives.length)} — board the drop ship`
      : `${formatWhole(done)} / ${formatWhole(objectives.length)}`;
    const doc = this.list.ownerDocument;
    this.list.replaceChildren();
    for (const [index, objective] of objectives.entries()) {
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
      this.list.appendChild(
        rowElement(
          doc,
          objective,
          row,
          objective.id === inReachId,
          countdowns?.get(objective.id),
        ),
      );
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
 * Draws one row: the objective's id and completion, the kind's `data-*`,
 * then the glyph and the label with the detail beside it (`inline`) or
 * under it (`stacked`), and the `in reach` mark last. A countdown goes
 * under the label (and under a stacked detail), which stacks an inline
 * row's label for it.
 */
function rowElement(
  doc: Document,
  objective: Objective,
  row: ObjectiveRow,
  inReach: boolean,
  countdown: ObjectiveCountdown | undefined,
): HTMLLIElement {
  const item = doc.createElement("li");
  item.dataset.objectiveId = objective.id;
  item.dataset.complete = objective.complete ? "true" : "false";
  for (const [key, value] of Object.entries(row.data)) {
    item.dataset[key] = value;
  }
  if (inReach) {
    item.dataset.inReach = "true";
  }
  const glyph = iconGlyph(doc, row.icon);
  const label = doc.createElement("span");
  label.textContent = row.label;
  const detail = row.detail && detailElement(doc, row.detail);
  const deadline = countdown && countdownElement(doc, countdown);
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
    if (deadline) {
      stack.appendChild(deadline);
    }
    item.append(glyph, stack);
  } else {
    if (deadline) {
      // "Pod matures in 3 turns" is as wide as the rail, so it goes
      // under the label rather than beside it, and the detail stays put.
      const stack = doc.createElement("span");
      stack.className = STACK_CLASS;
      stack.append(label, deadline);
      item.append(glyph, stack);
    } else {
      item.append(glyph, label);
    }
    if (detail) {
      item.appendChild(detail);
    }
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
 * A deadline countdown as a monospace line, `data-role="deadline"`,
 * with `data-urgent` saying whether it pulses.
 */
function countdownElement(
  doc: Document,
  countdown: ObjectiveCountdown,
): HTMLElement {
  const span = doc.createElement("span");
  span.className = `tut-mono ${DEADLINE_CLASS}`;
  span.dataset.role = "deadline";
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
