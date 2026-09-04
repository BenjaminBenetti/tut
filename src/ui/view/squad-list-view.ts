import type { RosterState } from "../../roster/model/roster-state";
import type { Squad } from "../../roster/model/squad";
import type { SquadType, SquadTypeId } from "../../roster/model/squad-type";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import { formatCredits, formatWhole } from "../service/format";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Types
// ===========================================

/** What the squad list reports back to its owner. */
export interface SquadListViewHandlers {
  /** The player pressed Hire with a type and name. */
  readonly onHire: (typeId: SquadTypeId, name: string) => void;
  /** The player pressed Reinforce; `soldiers` is everything the squad is missing. */
  readonly onReinforce: (squadId: string, soldiers: number) => void;
}

/** What the list needs to render one frame. */
export interface SquadListModel {
  readonly roster: RosterState;
  readonly credits: number;
}

// ===========================================
// SquadListView
// ===========================================

/**
 * The roster's infantry panel: one row per squad with type, strength,
 * kills and xp and a Reinforce button priced at the type's per-soldier
 * rate for every missing soldier, plus a hire form whose type picker
 * shows each type's cost. Buttons the treasury cannot cover are
 * disabled; the rows are rebuilt on every `update` since the roster is
 * small.
 *
 * ```
 *   ┌ Squads ─────────────────────────────────────────────┐
 *   │ name  │ type   │ strength │ kills │ xp │ [Reinforce ¢160] │
 *   │ …                                                    │
 *   │ Hire: [type ▾ (¢500)] [name____] [Hire ¢500]          │
 *   └──────────────────────────────────────────────────────┘
 * ```
 */
export class SquadListView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: SquadListViewHandlers;
  private readonly squadTypes: SquadTypeCatalogue;
  private root: HTMLElement | undefined;
  private rows: HTMLTableSectionElement | undefined;
  private typePicker: HTMLSelectElement | undefined;
  private nameInput: HTMLInputElement | undefined;
  private hireButton: HTMLButtonElement | undefined;
  private credits = 0;
  private readonly disposers: (() => void)[] = [];
  private squads: readonly Squad[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param handlers - Callbacks for hire and reinforce.
   * @param squadTypes - Catalogue the picker and prices are read from.
   */
  constructor(handlers: SquadListViewHandlers, squadTypes: SquadTypeCatalogue) {
    this.handlers = handlers;
    this.squadTypes = squadTypes;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("section");
    panel.id = "squad-list";
    panel.className = "tut-panel tut-roster__panel";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Squads";

    const table = doc.createElement("table");
    table.className = "tut-table";
    const head = doc.createElement("thead");
    const headRow = doc.createElement("tr");
    for (const label of ["Name", "Type", "Strength", "Kills", "XP", ""]) {
      const th = doc.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    const rows = doc.createElement("tbody");
    table.append(head, rows);

    const form = this.createHireForm(doc);

    panel.append(title, table, form.root);
    parent.appendChild(panel);

    this.root = panel;
    this.rows = rows;
    this.typePicker = form.picker;
    this.nameInput = form.name;
    this.hireButton = form.button;
  }

  /** Rebuilds the rows and re-prices the hire form from `model`. */
  update(model: SquadListModel): void {
    this.squads = model.roster.squads;
    if (!this.rows) {
      return;
    }
    this.credits = model.credits;
    const doc = this.rows.ownerDocument;
    this.rows.replaceChildren(
      ...model.roster.squads.map((squad) => this.createRow(doc, squad)),
    );
    this.refreshHireForm();
  }

  /** Removes the panel and every listener added since `mount`. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.rows = undefined;
    this.typePicker = undefined;
    this.nameInput = undefined;
    this.hireButton = undefined;
  }

  // ===========================================
  // Rows
  // ===========================================

  /** One squad row with its Reinforce button. */
  private createRow(doc: Document, squad: Squad): HTMLTableRowElement {
    const row = doc.createElement("tr");
    row.dataset.squadId = squad.id;
    const type = this.squadTypes.getSquadType(squad.typeId);
    const missing = squad.maxStrength - squad.strength;
    const cost = (type?.reinforceCostPerSoldier ?? 0) * missing;

    // Same kind glyph the deployment picker and the unit card use, so a
    // squad reads as a squad wherever it appears (#595).
    //
    // The flex row is a span *inside* the cell, not the cell itself:
    // `display: flex` on a `td` takes it out of the table's own layout
    // and its bottom border stops lining up with the rest of the row.
    const nameCell = doc.createElement("td");
    nameCell.dataset.field = "name";
    const nameRow = doc.createElement("span");
    nameRow.className = "tut-row";
    nameRow.append(iconGlyph(doc, "squad"), doc.createTextNode(squad.name));
    nameCell.appendChild(nameRow);

    row.append(
      nameCell,
      this.cell(doc, type?.name ?? squad.typeId, "type"),
      this.cell(
        doc,
        `${formatWhole(squad.strength)} / ${formatWhole(squad.maxStrength)}`,
        "strength",
      ),
      this.cell(doc, formatWhole(squad.kills), "kills"),
      this.cell(doc, formatWhole(squad.xp), "xp"),
    );

    const actions = doc.createElement("td");
    const reinforce = doc.createElement("button");
    reinforce.type = "button";
    reinforce.className = "tut-btn";
    reinforce.dataset.action = "reinforce";
    reinforce.textContent =
      missing === 0 ? "Full strength" : `Reinforce ${formatCredits(cost)}`;
    reinforce.disabled =
      missing === 0 || type === undefined || cost > this.credits;
    reinforce.title =
      missing > 0 && cost > this.credits ? "Not enough credits" : "";
    this.listen(reinforce, () => {
      this.handlers.onReinforce(squad.id, missing);
    });
    actions.appendChild(reinforce);
    row.appendChild(actions);
    return row;
  }

  /** A data cell carrying `data-field` for tests. */
  private cell(
    doc: Document,
    text: string,
    field: string,
  ): HTMLTableCellElement {
    const td = doc.createElement("td");
    td.dataset.field = field;
    td.textContent = text;
    return td;
  }

  // ===========================================
  // Hire form
  // ===========================================

  /** The type picker, name field and Hire button. */
  private createHireForm(doc: Document): {
    root: HTMLElement;
    picker: HTMLSelectElement;
    name: HTMLInputElement;
    button: HTMLButtonElement;
  } {
    const form = doc.createElement("div");
    form.className = "tut-row tut-roster__hire";

    const picker = doc.createElement("select");
    picker.className = "tut-select";
    picker.dataset.field = "hire-type";
    for (const type of this.squadTypes.listSquadTypes()) {
      const option = doc.createElement("option");
      option.value = type.id;
      option.textContent = `${type.name} · ${formatCredits(type.hireCost)}`;
      picker.appendChild(option);
    }

    const name = doc.createElement("input");
    name.type = "text";
    name.className = "tut-input";
    name.placeholder = "Squad name";
    name.dataset.field = "hire-name";
    name.maxLength = 24;

    const button = doc.createElement("button");
    button.type = "button";
    button.className = "tut-btn tut-btn--primary";
    button.dataset.action = "hire";
    button.textContent = "Hire";

    this.listen(
      picker,
      () => {
        this.refreshHireForm();
      },
      "change",
    );
    this.listen(
      name,
      () => {
        this.refreshHireForm();
      },
      "input",
    );
    this.listen(button, () => {
      const type = this.selectedType();
      if (!type || !this.nameInput) {
        return;
      }
      const chosen = this.nameInput.value.trim();
      this.handlers.onHire(
        type.id,
        chosen === "" ? nextSquadName(type, this.squads) : chosen,
      );
      this.nameInput.value = "";
      this.refreshHireForm();
    });

    form.append(picker, name, button);
    return { root: form, picker, name, button };
  }

  /** The catalogue entry the picker currently shows. */
  private selectedType(): SquadType | undefined {
    return this.typePicker
      ? this.squadTypes.getSquadType(this.typePicker.value)
      : undefined;
  }

  /** Re-labels and enables the Hire button for the selected type and balance. */
  private refreshHireForm(): void {
    if (!this.hireButton) {
      return;
    }
    const type = this.selectedType();
    if (!type) {
      this.hireButton.textContent = "Hire";
      this.hireButton.disabled = true;
      return;
    }
    this.hireButton.textContent = `Hire ${formatCredits(type.hireCost)}`;
    const affordable = type.hireCost <= this.credits;
    this.hireButton.disabled = !affordable;
    this.hireButton.title = affordable ? "" : "Not enough credits";
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Attaches a listener and remembers how to remove it. */
  private listen(
    target: HTMLElement,
    handler: () => void,
    event: "click" | "change" | "input" = "click",
  ): void {
    target.addEventListener(event, handler);
    this.disposers.push(() => {
      target.removeEventListener(event, handler);
    });
  }
}

// ===========================================
// Naming
// ===========================================

/**
 * A default name for a hired squad when the player leaves the field
 * blank: the type name numbered per type across the roster (#294), so
 * the third rifle squad hired is "Rifle Squad 3" and never
 * "Rifle Squad squad".
 */
function nextSquadName(type: SquadType, squads: readonly Squad[]): string {
  const ofType = squads.filter((squad) => squad.typeId === type.id).length;
  return `${type.name} ${String(ofType + 1)}`;
}
