import { INSTALLATION_SITES } from "../../content/data/installation-sites";
import type { IconId } from "../data/icon-manifest";
import type {
  DefendGeneratorsObjective,
  Objective,
  ObjectiveId,
  Spawner,
} from "../../tactical/model/tactical-state";
import type { DefenceProgress } from "../../tactical/service/defence-service";
import { formatWhole } from "../service/format";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// ObjectiveTrackerView
// ===========================================

/**
 * The mission's objectives (GDD §6.3): one row per objective with its
 * state, and for spawner objectives the spawner's remaining hit points.
 * Rows are rebuilt on every update; there are a handful at most.
 *
 * ```
 *   OBJECTIVES  1 / 2
 *   ├ ✓ Destroy spawner spawner-1
 *   └ ○ Destroy spawner spawner-2 · 20 hp · IN REACH
 *
 *   OBJECTIVES  0 / 1
 *   └ ⛨ Defend the sensor array · 2 / 3 generators · wave 3 / 5 · 4 bugs left
 * ```
 *
 * The row marked `in reach` is the one Interact would work, so a player
 * with two spawners in range can see which gets the charges (#427). A
 * defence row (#1175) reads its numbers from the progress the HUD
 * computes, since the objective record only mirrors them at phase ends.
 */
export class ObjectiveTrackerView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private summary: HTMLElement | undefined;
  private list: HTMLElement | undefined;

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
   */
  update(
    objectives: readonly Objective[],
    spawners: readonly Spawner[],
    inReachId?: ObjectiveId,
    defence?: DefenceProgress,
  ): void {
    if (!this.list || !this.summary) {
      return;
    }
    const done = objectives.filter((o) => o.complete).length;
    this.summary.textContent = `${formatWhole(done)} / ${formatWhole(objectives.length)}`;
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
      const row = doc.createElement("li");
      row.dataset.objectiveId = objective.id;
      row.dataset.complete = objective.complete ? "true" : "false";
      if (objective.kind === "defend-generators") {
        this.list.appendChild(defenceRow(doc, row, objective, defence));
        continue;
      }
      // The spawner the objective tracks, so a test can name the thing on
      // the map that has to come down (#484).
      row.dataset.targetId = objective.targetId;
      if (objective.id === inReachId) {
        row.dataset.inReach = "true";
      }
      // The state glyph replaces the ✓ / ○ text markers (#495): `check`
      // for a finished objective, `egg` for the spawner still standing.
      const icon: IconId = objective.complete ? "check" : "egg";
      const glyph = iconGlyph(doc, icon);
      const label = doc.createElement("span");
      // The word still carries the state for a screen reader, since the
      // glyph beside it is decorative.
      //
      // The ordinal, not the target id (#949). "Destroy spawner
      // spawner-1" said nothing about *which* nest it was — the only
      // question the label could usefully answer — and it wrapped onto a
      // second line, so every objective cost two rows of the rail
      // instead of one. The index is stable for the length of the
      // mission because a finished objective stays in the array; the id
      // is still on `data-target-id` for the scene and for tests.
      label.textContent = `${objective.complete ? "Destroyed" : "Destroy"} spawner ${String(index + 1)}`;
      row.append(glyph, label);
      const spawner = spawners.find((s) => s.id === objective.targetId);
      if (spawner && !spawner.destroyed) {
        const hp = doc.createElement("span");
        hp.className = "tut-mono tut-dim";
        hp.textContent = `${formatWhole(spawner.hp)} hp`;
        row.appendChild(hp);
      }
      if (objective.id === inReachId) {
        const reach = doc.createElement("span");
        reach.className = "tut-mono";
        reach.dataset.role = "in-reach";
        reach.textContent = "in reach";
        row.appendChild(reach);
      }
      this.list.appendChild(row);
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
 * Fills a defence's row (#1175): the installation by name, generators
 * standing over total, the wave count, and once the last wave is in,
 * how many bugs are left to kill. Failed reads as such, in the danger
 * tone, so the player knows the objective is gone before the debrief.
 */
function defenceRow(
  doc: Document,
  row: HTMLLIElement,
  objective: DefendGeneratorsObjective,
  progress: DefenceProgress | undefined,
): HTMLLIElement {
  const status =
    progress?.status ??
    (objective.failed ? "failed" : objective.complete ? "complete" : "open");
  row.dataset.status = status;
  row.dataset.failed = status === "failed" ? "true" : "false";
  const icon: IconId =
    status === "complete"
      ? "check"
      : status === "failed"
        ? "warning"
        : "defend";
  const label = doc.createElement("span");
  const name = INSTALLATION_SITES[objective.installation].name.toLowerCase();
  label.textContent =
    status === "complete"
      ? `Held the ${name}`
      : status === "failed"
        ? `Lost the ${name}`
        : `Defend the ${name}`;
  // The label over its progress line, not beside it: "2 / 3 generators
  // · wave 3 / 5" is wider than the rail leaves, and beside the label it
  // squeezed every word onto its own line and ran off the panel.
  const text = doc.createElement("span");
  text.className = "tut-hud__defence";
  text.appendChild(label);
  row.append(iconGlyph(doc, icon), text);
  if (progress !== undefined) {
    const detail = doc.createElement("span");
    detail.className = "tut-mono tut-dim";
    detail.dataset.role = "defence-progress";
    const waves =
      progress.totalWaves === undefined
        ? `wave ${formatWhole(progress.wave)}`
        : `wave ${formatWhole(progress.wave)} / ${formatWhole(progress.totalWaves)}`;
    const parts = [
      `${formatWhole(progress.standing)} / ${formatWhole(progress.total)} generators`,
      waves,
    ];
    if (
      progress.totalWaves !== undefined &&
      progress.wave >= progress.totalWaves &&
      status === "open"
    ) {
      parts.push(
        `${formatWhole(progress.bugsLeft)} ${progress.bugsLeft === 1 ? "bug" : "bugs"} left`,
      );
    }
    detail.textContent = parts.join(" · ");
    text.appendChild(detail);
  }
  return row;
}
