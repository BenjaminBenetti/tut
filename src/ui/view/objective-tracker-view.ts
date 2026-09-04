import type { IconId } from "../data/icon-manifest";
import type {
  Objective,
  ObjectiveId,
  Spawner,
} from "../../tactical/model/tactical-state";
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
 * ```
 *
 * The row marked `in reach` is the one Interact would work, so a player
 * with two spawners in range can see which gets the charges (#427).
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
  ): void {
    if (!this.list || !this.summary) {
      return;
    }
    const done = objectives.filter((o) => o.complete).length;
    this.summary.textContent = `${formatWhole(done)} / ${formatWhole(objectives.length)}`;
    const doc = this.list.ownerDocument;
    this.list.replaceChildren();
    for (const objective of objectives) {
      const row = doc.createElement("li");
      row.dataset.objectiveId = objective.id;
      // The spawner the objective tracks, so a test can name the thing on
      // the map that has to come down (#484).
      row.dataset.targetId = objective.targetId;
      row.dataset.complete = objective.complete ? "true" : "false";
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
      label.textContent = `${objective.complete ? "Destroyed" : "Destroy"} spawner ${objective.targetId}`;
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
