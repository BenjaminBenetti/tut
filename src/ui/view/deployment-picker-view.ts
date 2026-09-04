import type { DeploymentAssessment } from "../../overworld/model/deployment-assessment";
import type { Mech, MechId } from "../../roster/model/mech";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import type { Squad, SquadId } from "../../roster/model/squad";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import { formatWhole } from "../service/format";
import { formatOdds, oddsTone } from "../service/odds-band";

// ===========================================
// Types
// ===========================================

/** What the picker reports back to its owner. */
export interface DeploymentPickerHandlers {
  /** A squad's checkbox changed. */
  readonly onToggleSquad: (squadId: SquadId, selected: boolean) => void;
  /** A mech's checkbox changed. */
  readonly onToggleMech: (mechId: MechId, selected: boolean) => void;
}

/** What the picker needs to name things. */
export interface DeploymentPickerDeps {
  readonly squadTypes: SquadTypeCatalogue;
}

/** Everything the picker renders from. */
export interface DeploymentPickerModel {
  /** Squads that can deploy: the roster's, since wiped squads are removed from it. */
  readonly squads: readonly Squad[];
  /** Mechs that can deploy: the roster's, since destroyed mechs are removed from it. */
  readonly mechs: readonly Mech[];
  readonly selectedSquadIds: ReadonlySet<SquadId>;
  readonly selectedMechIds: ReadonlySet<MechId>;
  /** The resolver-side assessment of the current pick, or undefined with no mission. */
  readonly assessment: DeploymentAssessment | undefined;
  /**
   * Most units this deployment may carry (#487). At the cap, unpicked
   * rows are disabled rather than left to fail at Launch; the already
   * picked stay enabled so a player can swap one out.
   */
  readonly maxUnits: number;
}

/** Why a row is unpickable once the deployment is full (#487). */
const DEPLOYMENT_FULL_REASON = "The deployment is full";

// ===========================================
// DeploymentPickerView
// ===========================================

/**
 * The deployment checklist: one row per squad (strength) and per mech
 * (damage) with a checkbox, and the force-versus-difficulty readout
 * beneath. Rows are keyed by unit id and reused across updates.
 *
 * ```
 *   ┌ SQUADS ─────────────────────┐  ┌ MECHS ─────────────────┐
 *   │ ☑ Alpha   Rifle Squad  5/5  │  │ ☐ Hammer   40 % damage │
 *   │ ☐ Bravo   Rocket Squad 3/5  │  └────────────────────────┘
 *   └─────────────────────────────┘
 *   FORCE 24 · TARGET 30 · WIN CHANCE 38 % ▮danger
 * ```
 */
export class DeploymentPickerView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: DeploymentPickerDeps;
  private readonly handlers: DeploymentPickerHandlers;
  private root: HTMLElement | undefined;
  private squadBody: HTMLElement | undefined;
  private mechBody: HTMLElement | undefined;
  private noSquads: HTMLElement | undefined;
  private noMechs: HTMLElement | undefined;
  private force: HTMLElement | undefined;
  private target: HTMLElement | undefined;
  private odds: HTMLElement | undefined;
  private readonly squadRows = new Map<SquadId, HTMLTableRowElement>();
  private readonly mechRows = new Map<MechId, HTMLTableRowElement>();
  private onChange: ((event: Event) => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param deps - Catalogue for naming squad types.
   * @param handlers - Callbacks for checkbox changes.
   */
  constructor(deps: DeploymentPickerDeps, handlers: DeploymentPickerHandlers) {
    this.deps = deps;
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the two tables and the assessment line under `parent`. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.className = "tut-panel tut-deployment__picker";
    section.dataset.role = "deployment-picker";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Deployment";

    const squads = this.createTable(doc, "deploy-squads", "Squads", [
      "",
      "Name",
      "Type",
      "Strength",
    ]);
    const mechs = this.createTable(doc, "deploy-mechs", "Mechs", [
      "",
      "Name",
      "Damage",
    ]);
    const noSquads = this.createNote(
      doc,
      "no-squads",
      "No squads in the roster.",
    );
    const noMechs = this.createNote(doc, "no-mechs", "No mechs in the roster.");

    const assessment = doc.createElement("div");
    assessment.className = "tut-row tut-deployment__assessment";
    assessment.dataset.role = "assessment";
    const force = this.createStat(doc, "Force", "force");
    const target = this.createStat(doc, "Even fight", "target");
    const odds = this.createStat(doc, "Win chance", "win-chance");
    odds.value.classList.add("tut-badge");
    assessment.append(force.stat, target.stat, odds.stat);

    section.append(
      title,
      squads.table,
      noSquads,
      mechs.table,
      noMechs,
      assessment,
    );
    parent.appendChild(section);

    this.onChange = (event: Event): void => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") {
        return;
      }
      const row = input.closest<HTMLElement>("tr");
      if (row?.dataset.squadId !== undefined) {
        this.handlers.onToggleSquad(row.dataset.squadId, input.checked);
      } else if (row?.dataset.mechId !== undefined) {
        this.handlers.onToggleMech(row.dataset.mechId, input.checked);
      }
    };
    section.addEventListener("change", this.onChange);

    this.root = section;
    this.squadBody = squads.body;
    this.mechBody = mechs.body;
    this.noSquads = noSquads;
    this.noMechs = noMechs;
    this.force = force.value;
    this.target = target.value;
    this.odds = odds.value;
  }

  /** Syncs rows, checkboxes and the assessment to the model. */
  update(model: DeploymentPickerModel): void {
    if (!this.squadBody || !this.mechBody || !this.noSquads || !this.noMechs) {
      return;
    }
    const doc = this.squadBody.ownerDocument;
    const picked = model.selectedSquadIds.size + model.selectedMechIds.size;
    const full = picked >= model.maxUnits;
    this.syncRows(
      doc,
      this.squadBody,
      this.squadRows,
      model.squads.map((squad) => ({
        id: squad.id,
        cells: [
          squad.name,
          this.deps.squadTypes.getSquadType(squad.typeId)?.name ?? squad.typeId,
          `${formatWhole(squad.strength)}/${formatWhole(squad.maxStrength)}`,
        ],
        selected: model.selectedSquadIds.has(squad.id),
        disabled: full && !model.selectedSquadIds.has(squad.id),
      })),
      "squadId",
      "toggle-squad",
    );
    this.syncRows(
      doc,
      this.mechBody,
      this.mechRows,
      model.mechs.map((mech) => ({
        id: mech.id,
        cells: [
          mech.name,
          `${formatWhole((mech.damage / MECH_MAX_DAMAGE) * 100)} % damage`,
        ],
        selected: model.selectedMechIds.has(mech.id),
        disabled: full && !model.selectedMechIds.has(mech.id),
      })),
      "mechId",
      "toggle-mech",
    );
    this.noSquads.hidden = model.squads.length > 0;
    this.noMechs.hidden = model.mechs.length > 0;
    this.renderAssessment(model.assessment);
  }

  /** Removes the section and its listener. */
  unmount(): void {
    if (this.root && this.onChange) {
      this.root.removeEventListener("change", this.onChange);
    }
    this.root?.remove();
    this.root = undefined;
    this.squadBody = undefined;
    this.mechBody = undefined;
    this.noSquads = undefined;
    this.noMechs = undefined;
    this.force = undefined;
    this.target = undefined;
    this.odds = undefined;
    this.squadRows.clear();
    this.mechRows.clear();
    this.onChange = undefined;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** A titled table with the given headers and an empty body. */
  private createTable(
    doc: Document,
    id: string,
    caption: string,
    headers: readonly string[],
  ): { table: HTMLTableElement; body: HTMLTableSectionElement } {
    const table = doc.createElement("table");
    table.id = id;
    table.className = "tut-table";
    const cap = doc.createElement("caption");
    cap.className = "tut-label";
    cap.textContent = caption;
    const head = doc.createElement("thead");
    const headRow = doc.createElement("tr");
    for (const header of headers) {
      const th = doc.createElement("th");
      th.textContent = header;
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    const body = doc.createElement("tbody");
    table.append(cap, head, body);
    return { table, body };
  }

  /** A dim note with a `data-role`, hidden until `update` decides. */
  private createNote(doc: Document, role: string, text: string): HTMLElement {
    const note = doc.createElement("p");
    note.className = "tut-dim";
    note.dataset.role = role;
    note.textContent = text;
    note.hidden = true;
    return note;
  }

  /** Label plus value cell for the assessment line. */
  private createStat(
    doc: Document,
    label: string,
    field: string,
  ): { stat: HTMLElement; value: HTMLElement } {
    const stat = doc.createElement("span");
    stat.className = "tut-topbar__stat";
    const term = doc.createElement("span");
    term.className = "tut-label";
    term.textContent = label;
    const value = doc.createElement("span");
    value.className = "tut-data";
    value.dataset.field = field;
    value.textContent = "—";
    stat.append(term, value);
    return { stat, value };
  }

  /**
   * Reconciles a table body with a list of rows keyed by id: existing
   * rows are updated in place and reordered, missing ones created,
   * vanished ones removed.
   */
  private syncRows(
    doc: Document,
    body: HTMLElement,
    rows: Map<string, HTMLTableRowElement>,
    items: readonly {
      id: string;
      cells: readonly string[];
      selected: boolean;
      disabled: boolean;
    }[],
    idKey: "squadId" | "mechId",
    action: string,
  ): void {
    const keep = new Set<string>();
    for (const item of items) {
      keep.add(item.id);
      let row = rows.get(item.id);
      if (!row) {
        row = doc.createElement("tr");
        row.dataset[idKey] = item.id;
        const pick = doc.createElement("td");
        const box = doc.createElement("input");
        box.type = "checkbox";
        box.dataset.action = action;
        pick.appendChild(box);
        row.appendChild(pick);
        for (let i = 0; i < item.cells.length; i++) {
          const td = doc.createElement("td");
          td.dataset.field = `cell-${String(i)}`;
          row.appendChild(td);
        }
        rows.set(item.id, row);
      }
      const box = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (box && box.checked !== item.selected) {
        box.checked = item.selected;
      }
      if (box) {
        box.disabled = item.disabled;
        box.title = item.disabled ? DEPLOYMENT_FULL_REASON : "";
      }
      const cells = row.querySelectorAll<HTMLElement>("td[data-field]");
      item.cells.forEach((text, i) => {
        const cell = cells[i];
        if (cell && cell.textContent !== text) {
          cell.textContent = text;
        }
      });
      row.classList.toggle("is-selected", item.selected);
      row.classList.toggle("is-disabled", item.disabled);
      body.appendChild(row);
    }
    for (const [id, row] of rows) {
      if (!keep.has(id)) {
        row.remove();
        rows.delete(id);
      }
    }
  }

  /** Writes force, target and odds, or dashes without an assessment. */
  private renderAssessment(assessment: DeploymentAssessment | undefined): void {
    if (!this.force || !this.target || !this.odds) {
      return;
    }
    if (!assessment) {
      this.force.textContent = "—";
      this.target.textContent = "—";
      this.odds.textContent = "—";
      this.odds.className = "tut-data tut-badge";
      delete this.odds.dataset.tone;
      return;
    }
    const tone = oddsTone(assessment.winProbability);
    this.setText(this.force, formatWhole(assessment.force));
    this.setText(this.target, formatWhole(assessment.target));
    this.setText(this.odds, formatOdds(assessment.winProbability));
    this.odds.className = `tut-data tut-badge tut-badge--${tone}`;
    this.odds.dataset.tone = tone;
  }

  /** Writes text only when it changed. */
  private setText(element: HTMLElement, text: string): void {
    if (element.textContent !== text) {
      element.textContent = text;
    }
  }
}
